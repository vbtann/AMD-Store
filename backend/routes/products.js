const express = require('express');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const router = express.Router();

/**
 * @route   GET /api/products
 * @desc    Get all products
 * @access  Public
 */
router.get('/', async (req, res) => {
	try {
		const { category, search, available } = req.query;

		// Build query
		let query = {};

		// Filter by availability (default: only available products)
		if (available !== 'all') {
			query.available = available === 'false' ? false : true;
		}

		// Filter by category
		if (category && category !== 'all') {
			query.category = category;
		}

		// Search by name or description
		if (search) {
			query.$or = [
				{ name: { $regex: search, $options: 'i' } },
				{ description: { $regex: search, $options: 'i' } }
			];
		}

		// Get products with sorting
		const products = await Product.find(query)
			.sort({ category: 1, name: 1 })
			.lean();

		// Group products by category
		const categories = [...new Set(products.map(p => p.category))];
		const groupedProducts = categories.reduce((acc, category) => {
			acc[category] = products.filter(p => p.category === category);
			return acc;
		}, {});

		res.json({
			success: true,
			data: {
				products,
				groupedProducts,
				categories,
				total: products.length
			}
		});

	} catch (error) {
		logger.error('Error fetching products', error, logger.getRequestContext(req));
		res.status(500).json({
			success: false,
			message: 'Lỗi server khi lấy danh sách sản phẩm'
		});
	}
});

/**
 * @route   GET /api/products/direct-sales
 * @desc    Get products available for direct sales (filters by isActive instead of available)
 * @access  Public
 */
router.get('/direct-sales', async (req, res) => {
	try {
		const { category, search } = req.query;

		// Build query - for direct sales, only filter by isActive (not available)
		let query = {
			isActive: true  // Only active products can be sold in direct sales
		};

		// Filter by category
		if (category && category !== 'all') {
			query.category = category;
		}

		// Search by name or description
		if (search) {
			query.$or = [
				{ name: { $regex: search, $options: 'i' } },
				{ description: { $regex: search, $options: 'i' } }
			];
		}

		// Get products with sorting
		const products = await Product.find(query)
			.sort({ category: 1, name: 1 })
			.lean();

		// Group products by category
		const categories = [...new Set(products.map(p => p.category))];
		const groupedProducts = categories.reduce((acc, category) => {
			acc[category] = products.filter(p => p.category === category);
			return acc;
		}, {});

		res.json({
			success: true,
			data: {
				products,
				groupedProducts,
				categories,
				total: products.length
			}
		});

	} catch (error) {
		logger.error('Error fetching direct-sales products', error, logger.getRequestContext(req));
		res.status(500).json({
			success: false,
			message: 'Lỗi server khi lấy danh sách sản phẩm bán trực tiếp'
		});
	}
});

/**
 * @route   GET /api/products/:id
 * @desc    Get single product by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
	try {
		const product = await Product.findById(req.params.id);

		if (!product) {
			return res.status(404).json({
				success: false,
				message: 'Không tìm thấy sản phẩm'
			});
		}

		res.json({
			success: true,
			data: product
		});

	} catch (error) {
		if (error.name === 'CastError') {
			logger.warn('Invalid product ID', { productId: req.params.id });
			return res.status(400).json({
				success: false,
				message: 'ID sản phẩm không hợp lệ'
			});
		}

		logger.error('Error fetching product', error, {
			productId: req.params.id,
			...logger.getRequestContext(req)
		});
		res.status(500).json({
			success: false,
			message: 'Lỗi server khi lấy thông tin sản phẩm'
		});
	}
});

/**
 * @route   GET /api/products/categories/list
 * @desc    Get all product categories
 * @access  Public
 */
router.get('/categories/list', async (req, res) => {
	try {
		const categories = await Product.distinct('category');

		res.json({
			success: true,
			data: categories.sort()
		});

	} catch (error) {
		logger.error('Error fetching categories', error, logger.getRequestContext(req));
		res.status(500).json({
			success: false,
			message: 'Lỗi server khi lấy danh sách danh mục'
		});
	}
});

module.exports = router;
