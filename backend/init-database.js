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

		// Check if admin user already exists using better-auth's native MongoDB connection
		// Note: better-auth uses native MongoDB driver, not Mongoose
		const { MongoClient } = require('mongodb');
		const mongoClient = new MongoClient(process.env.MONGODB_URI);
		await mongoClient.connect();
		const betterAuthDb = mongoClient.db();

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
				// Use better-auth context adapter directly for more control
				// This approach is more reliable for setting username with username plugin
				const ctx = await auth.api.getContext();
				const { adapter } = ctx;

				// First create the user with adapter (this handles username plugin properly)
				const createdUser = await adapter.create({
					model: 'user',
					data: {
						email: adminEmail,
						name: 'System Administrator',
						emailVerified: false,
						username: adminUsername, // Username plugin field
						displayUsername: 'Admin', // Additional field
						role: 'admin', // Admin plugin field
						image: null,
						createdAt: new Date(),
						updatedAt: new Date()
					}
				});

				if (!createdUser || !createdUser.id) {
					throw new Error('Failed to create user - no ID returned');
				}

				console.log('✅ User record created:', {
					id: createdUser.id,
					email: createdUser.email,
					username: createdUser.username,
					displayUsername: createdUser.displayUsername,
					role: createdUser.role
				});

				// Then create the credential account with hashed password
				const hashedPassword = await auth.api.hashPassword(adminPassword);

				await adapter.create({
					model: 'account',
					data: {
						userId: createdUser.id,
						accountId: createdUser.email, // Use email as accountId for credential provider
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
					}
				});

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

		await mongoClient.close();

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
