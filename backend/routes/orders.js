const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { validateOrder } = require('../middleware/validation');
const { generateOrderCode, calculateTotal } = require('../utils/helpers');
const { sendOrderToAppScript } = require('../utils/appscript');
const { generateOrderPaymentQR, formatOrderPaymentDescription } = require('../utils/paymentHelper');
const ComboService = require('../services/ComboService');
const logger = require('../utils/logger');
const router = express.Router();

/**
 * @route   POST /api/orders
 * @desc    Create a new order
 * @access  Public
 */
router.post('/', validateOrder, async (req, res) => {
	try {
		logger.info('Order creation started', {
			items: req.body.items?.length || 0,
			useOptimalPricing: req.body.useOptimalPricing
		});

		const { studentId, fullName, email, phoneNumber, school, additionalNote, items, optimalPricing, useOptimalPricing = false } = req.body;

		if (!items || !Array.isArray(items) || items.length === 0) {
			logger.warn('Invalid items in order request', { items });
			return res.status(400).json({
				success: false,
				message: 'Danh sách sản phẩm không hợp lệ'
			});
		}

		logger.debug('Processing items', { itemCount: items.length });

		let totalAmount;
		let comboInfo = null;
		let orderItems = [];

		if (useOptimalPricing && optimalPricing) {
			logger.info('Using optimal pricing from frontend');

			// Validate products exist
			const productIds = items.map(item => item.productId);
			const products = await Product.find({
				_id: { $in: productIds },
				available: true
			});

			if (products.length !== productIds.length) {
				logger.warn('Product validation failed', {
					requested: productIds.length,
					found: products.length
				});
				return res.status(400).json({
					success: false,
					message: 'Một hoặc nhiều sản phẩm không tồn tại hoặc không khả dụng'
				});
			}

			// Use the calculated optimal pricing
			totalAmount = optimalPricing.summary.finalTotal;

			// Create order items with optimal pricing information
			orderItems = items.map(item => {
				const product = products.find(p => p._id.toString() === item.productId);
				return {
					productId: product._id,
					productName: product.name,
					price: product.price, // Keep original price for reference
					quantity: item.quantity,
					fromCombo: false // Individual items in cart
				};
			});

			// Add combo information if savings exist
			if (optimalPricing.summary.totalSavings > 0) {
				comboInfo = {
					savings: optimalPricing.summary.totalSavings,
					originalTotal: optimalPricing.summary.originalTotal,
					finalTotal: optimalPricing.summary.finalTotal,
					combos: optimalPricing.combos || [],
					breakdown: optimalPricing.breakdown || []
				};
			}

			logger.debug('Optimal pricing applied', {
				originalTotal: optimalPricing.summary.originalTotal,
				finalTotal: totalAmount,
				savings: optimalPricing.summary.totalSavings
			});

		} else {
			logger.info('Using traditional combo detection');
			// Original combo detection logic as fallback
			let finalItems = items;

			logger.debug('Applying combo detection');
			const comboResult = await ComboService.detectAndApplyBestCombo(items, false);
			if (comboResult.success && comboResult.hasCombo) {
				finalItems = comboResult.finalItems;
				comboInfo = {
					comboId: comboResult.combo._id,
					comboName: comboResult.combo.name,
					savings: comboResult.savings,
					message: comboResult.message
				};
				logger.info('Combo applied', { comboName: comboResult.combo.name, savings: comboResult.savings });
			}

			logger.debug('Converting combo items to individual products');
			const expandedItems = ComboService.expandComboItems(finalItems);

			logger.debug('Validating products in database');
			const productIds = expandedItems.map(item => item.productId).filter(id => id);
			const products = await Product.find({
				_id: { $in: productIds },
				available: true
			});

			if (products.length !== productIds.length) {
				logger.warn('Product validation failed in traditional mode', {
					requested: productIds.length,
					found: products.length
				});
				return res.status(400).json({
					success: false,
					message: 'Một hoặc nhiều sản phẩm không tồn tại hoặc không khả dụng'
				});
			}

			logger.debug('Building order items with pricing');
			orderItems = expandedItems.map(item => {
				const product = products.find(p => p._id.toString() === item.productId);
				return {
					productId: product._id,
					productName: product.name,
					price: product.price,
					quantity: item.quantity,
					fromCombo: item.fromCombo || false,
					comboId: item.comboId || null,
					comboName: item.comboName || null
				};
			});

			logger.debug('Calculating total amount');
			if (comboInfo && finalItems.some(item => item.isCombo)) {
				totalAmount = finalItems.reduce((total, item) => {
					return total + (item.price * item.quantity);
				}, 0);
				logger.debug('Total with combo pricing', { totalAmount });
			} else {
				totalAmount = calculateTotal(orderItems);
				logger.debug('Total with individual pricing', { totalAmount });
			}
		}

		logger.debug('Generating unique order code');
		// Generate unique order code
		let orderCode;
		let isUnique = false;
		let attempts = 0;

		while (!isUnique && attempts < 10) {
			orderCode = generateOrderCode();
			const existingOrder = await Order.findOne({ orderCode });
			if (!existingOrder) {
				isUnique = true;
			}
			attempts++;
		}

		if (!isUnique) {
			logger.error('Failed to generate unique order code', null, { attempts });
			return res.status(500).json({
				success: false,
				message: 'Không thể tạo mã vé duy nhất'
			});
		}

		logger.info('Order code generated', { orderCode });

		logger.debug('Creating order in database');
		// Create order
		const order = new Order({
			orderCode,
			studentId,
			fullName,
			email,
			phoneNumber,
			school,
			additionalNote,
			items: orderItems,
			totalAmount,
			status: 'confirmed',
			lastUpdatedBy: 'system',
			comboInfo: comboInfo, // Store combo information
			statusHistory: [
				{
					status: 'confirmed',
					updatedBy: 'system',
					updatedAt: new Date(),
					note: 'Đơn hàng được tạo từ hệ thống'
				}
			]
		});

		await order.save();
		logger.success('Order saved successfully', { orderId: order._id, orderCode });

		// Generate payment QR URL and description
		let qrUrl = null;
		let paymentDescription = null;
		try {
			qrUrl = await generateOrderPaymentQR(totalAmount, orderCode, studentId, fullName);
			paymentDescription = await formatOrderPaymentDescription(orderCode, studentId, fullName);
			logger.debug('QR URL generated', { qrUrl });
		} catch (qrError) {
			logger.error('Failed to generate QR URL', qrError);
		}

		// Log dữ liệu gửi App Script
		const appscriptData = {
			orderCode,
			studentId,
			fullName,
			email,
			phoneNumber,
			school,
			additionalNote,
			items: orderItems,
			totalAmount
		};
		logger.debug('Pushing order to AppScript', { orderCode });
		// Gửi lên App Script sau, không chờ kết quả
		setImmediate(() => {
			sendOrderToAppScript(appscriptData).catch(err => {
				logger.error('Failed to send order to AppScript', err, { orderCode });
			});
		});

		res.status(201).json({
			success: true,
			message: 'Đơn hàng đã được tạo thành công',
			data: {
				orderCode,
				totalAmount,
				status: 'confirmed',
				createdAt: order.createdAt,
				comboInfo: comboInfo,
				qrUrl: qrUrl,
				paymentDescription: paymentDescription
			}
		});

	} catch (error) {
		logger.error('Error creating order', error, logger.getRequestContext(req));

		// More specific error handling
		if (error.name === 'ValidationError') {
			logger.warn('Order validation error', { errors: error.errors });
			return res.status(400).json({
				success: false,
				message: 'Dữ liệu đơn hàng không hợp lệ',
				errors: Object.values(error.errors).map(err => err.message)
			});
		}

		if (error.name === 'MongoError' || error.name === 'MongoServerError') {
			logger.error('Database error while creating order', error);
			return res.status(500).json({
				success: false,
				message: 'Lỗi cơ sở dữ liệu'
			});
		}

		res.status(500).json({
			success: false,
			message: 'Lỗi server khi tạo đơn hàng',
			...(process.env.NODE_ENV === 'development' && { debug: error.message })
		});
	}
});

/**
 * @route   GET /api/orders/:orderCode
 * @desc    Get order by order code (for customer tracking)
 * @access  Public
 */
router.get('/:orderCode', async (req, res) => {
	try {
		const { orderCode } = req.params;

		const order = await Order.findOne({
			orderCode: orderCode.toUpperCase()
		}).populate('items.productId', 'name description');

		if (!order) {
			return res.status(404).json({
				success: false,
				message: 'Không tìm thấy đơn hàng với mã này'
			});
		}

		// Generate QR code URL and payment description
		let qrUrl = null;
		let paymentDescription = null;
		try {
			qrUrl = await generateOrderPaymentQR(
				order.totalAmount,
				order.orderCode,
				order.studentId,
				order.fullName
			);
			paymentDescription = await formatOrderPaymentDescription(
				order.orderCode,
				order.studentId,
				order.fullName
			);
		} catch (error) {
			logger.error('Error generating payment info for tracking', error, { orderCode: order.orderCode });
		}

		// Return order information including payment details
		res.json({
			success: true,
			data: {
				orderCode: order.orderCode,
				studentId: order.studentId,
				fullName: order.fullName,
				status: order.status,
				totalAmount: order.totalAmount,
				createdAt: order.createdAt,
				statusUpdatedAt: order.statusUpdatedAt,
				qrUrl: qrUrl,
				paymentDescription: paymentDescription,
				items: order.items.map(item => ({
					productName: item.productName,
					quantity: item.quantity,
					price: item.price
				}))
			}
		});

	} catch (error) {
		logger.error('Error fetching order', error, {
			orderCode: req.params.orderCode,
			...logger.getRequestContext(req)
		});
		res.status(500).json({
			success: false,
			message: 'Lỗi server khi lấy thông tin đơn hàng'
		});
	}
});

module.exports = router;
