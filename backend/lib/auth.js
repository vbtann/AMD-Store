const { betterAuth } = require("better-auth");
const { MongoClient } = require("mongodb");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { admin, openAPI } = require("better-auth/plugins");
const { username } = require("better-auth/plugins");
const { jwt } = require("better-auth/plugins");
const { customSession } = require("better-auth/plugins");
const logger = require('../utils/logger');

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
	throw new Error('MONGODB_URI environment variable is required');
}

// Create MongoDB connection for better-auth with proper connection pooling
const client = new MongoClient(MONGODB_URI, {
	maxPoolSize: 10,
	minPoolSize: 2,
	maxIdleTimeMS: 10000,
	serverSelectionTimeoutMS: 5000,
	socketTimeoutMS: 45000,
	retryWrites: true,
	retryReads: true
});

// Connect the client
let isClientConnected = false;
const connectClient = async () => {
	if (!isClientConnected) {
		try {
			await client.connect();
			isClientConnected = true;
			logger.info('Better-auth MongoDB client connected');
		} catch (error) {
			logger.error('Better-auth MongoDB client connection failed', error);
			throw error;
		}
	}
};

// Initialize connection when module is loaded
connectClient().catch(err => {
	logger.critical('Failed to initialize better-auth MongoDB client', err);
});

const db = client.db();

const auth = betterAuth({
	database: mongodbAdapter(db),
	baseURL: process.env.BASE_URL || "http://localhost:5000",
	secret: process.env.JWT_SECRET,
	trustedOrigins: [
		...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : []),
		'https://store.sab.edu.vn',
		'https://api.store.sab.edu.vn',
		'http://localhost:3000',
		'http://127.0.0.1:3000'
	],
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 6,
		maxPasswordLength: 128,
		requireEmailVerification: false,
		sendEmailVerificationOnSignUp: false,
	},
	plugins: [
		openAPI(),
		username({
			minUsernameLength: 3,
			maxUsernameLength: 30,
		}),
		admin({
			defaultRole: "user",
			adminRoles: ["admin"],
			adminUserIds: [],
		}),
		customSession(async ({ user, session }) => {
			return {
				user: {
					...user,
					role: user.role, // Ensure role is included in session
				},
				session
			};
		}),
		jwt({
			jwt: {
				issuer: process.env.BASE_URL || "http://localhost:5000",
				audience: process.env.BASE_URL || "http://localhost:5000",
				expirationTime: "15m",
				definePayload: ({ user }) => {
					return {
						id: user.id,
						email: user.email,
						username: user.username,
						role: user.role,
						name: user.name,
					};
				},
			},
		}),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // 1 day
	},
	user: {
		additionalFields: {
			username: {
				type: "string",
				required: true,
			},
			displayUsername: {
				type: "string",
				required: false,
			},
			role: {
				type: "string",
				defaultValue: "user",
				required: false,
			},
		},
		modelName: "user",
	},
});

// Graceful shutdown handler for MongoDB client
const closeAuthClient = async () => {
	if (isClientConnected) {
		try {
			await client.close();
			isClientConnected = false;
			logger.info('Better-auth MongoDB client closed');
		} catch (error) {
			logger.error('Error closing better-auth MongoDB client', error);
		}
	}
};

// Handle process termination
process.on('SIGTERM', closeAuthClient);
process.on('SIGINT', closeAuthClient);

module.exports = { auth, closeAuthClient };
