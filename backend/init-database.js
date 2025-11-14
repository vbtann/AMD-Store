const { connectDB } = require('./lib/database');
const { auth } = require('./lib/auth');
const Product = require('./models/Product');
const Settings = require('./models/Settings');
const crypto = require('crypto');
require('dotenv').config();

const SETTINGS_KEY = 'payment_config';

async function initDatabase() {
	try {
		// Connect to MongoDB using Mongoose
		await connectDB();
		console.log('✅ Connected to MongoDB via Mongoose');

		// Admin credentials from environment
		const adminEmail = process.env.ADMIN_EMAIL || 'sab@fit.hcmus.edu.vn';
		const adminUsername = process.env.ADMIN_USERNAME || 'admin';
		const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

		// Use mongoose connection's native MongoDB driver to access better-auth collections
		// This avoids creating a new connection with wrong credentials
		const mongoose = require('mongoose');
		const betterAuthDb = mongoose.connection.db;

		const existingUser = await betterAuthDb.collection('user').findOne({
			$or: [{ email: adminEmail }, { username: adminUsername }]
		});

		if (existingUser) {
			console.log('⚠️  Existing admin user found:', {
				id: existingUser.id,
				email: existingUser.email,
				username: existingUser.username,
				role: existingUser.role
			});

			// Update role if not admin
			if (existingUser.role !== 'admin') {
				console.log('⚠️  User exists but is not admin. Updating role...');
				await betterAuthDb.collection('user').updateOne(
					{ email: adminEmail },
					{ $set: { role: 'admin', updatedAt: new Date() } }
				);
				console.log('✅ Updated user role to admin');
			}
		} else {
			console.log('📝 Creating new admin user...');
			try {
				// Hash password using better-auth
				const hashedPassword = await auth.api.hashPassword(adminPassword);

				// Generate a unique ID for the user
				const userId = crypto.randomUUID();

				// Create user document with username field
				const userDoc = {
					id: userId,
					email: adminEmail,
					name: 'System Administrator',
					emailVerified: false,
					username: adminUsername, // Username plugin field
					role: 'admin', // Admin plugin field
					image: null,
					createdAt: new Date(),
					updatedAt: new Date()
				};

				await betterAuthDb.collection('user').insertOne(userDoc);

				console.log('✅ User record created:', {
					id: userDoc.id,
					email: userDoc.email,
					username: userDoc.username,
					role: userDoc.role
				});

				// Create account (credential) document
				const accountDoc = {
					id: crypto.randomUUID(),
					userId: userId,
					accountId: adminEmail, // Use email as accountId for credential provider
					providerId: 'credential',
					password: hashedPassword,
					accessToken: null,
					refreshToken: null,
					idToken: null,
					accessTokenExpiresAt: null,
					refreshTokenExpiresAt: null,
					scope: null,
					createdAt: new Date(),
					updatedAt: new Date()
				};

				await betterAuthDb.collection('account').insertOne(accountDoc);

				console.log('✅ Admin user created successfully with username:', adminUsername);
			} catch (createError) {
				console.error('❌ Error creating admin user:', createError);
				console.error('[INIT-DB] Error details:', {
					message: createError.message,
					stack: createError.stack,
					name: createError.name
				});
				throw createError;
			}
		}

		// Initialize payment settings
		const existingSettings = await Settings.findOne({ key: SETTINGS_KEY });

		if (!existingSettings) {
			const bankNameId = process.env.BANK_NAME_ID || 'MB';
			const bankAccountId = process.env.BANK_ACCOUNT_ID || '0123456789';
			const prefixMessage = process.env.PREFIX_MESSAGE || 'SAB';

			await Settings.create({
				key: SETTINGS_KEY,
				bankNameId,
				bankAccountId,
				prefixMessage,
				updatedBy: 'system'
			});

			console.log('✅ Initialized payment settings');
		} else {
			console.log('⚠️  Payment settings already exist');
		}

		// Create sample products using Mongoose
		const existingProducts = await Product.countDocuments();

		if (existingProducts === 0) {
			const sampleProducts = [
				{
					name: "Áo thun SAB",
					price: 150000,
					image: "/fallback-product.png",
					description: "Áo thun chất lượng cao với logo SAB",
					status: "active",
					category: "Đồ mặc",
					stockQuantity: 50,
					available: true
				},
				{
					name: "Mũ SAB",
					price: 100000,
					image: "/fallback-product.png",
					description: "Mũ snapback phong cách với logo SAB",
					status: "active",
					category: "Phụ kiện",
					stockQuantity: 30,
					available: true
				}
			];

			await Product.insertMany(sampleProducts);
			console.log('✅ Created sample products');
		}

		console.log('✅ Database initialization completed successfully!');
		process.exit(0);

	} catch (error) {
		console.error('❌ Error initializing database:', error);
		process.exit(1);
	}
}

initDatabase();
