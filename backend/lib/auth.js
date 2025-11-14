const { betterAuth } = require("better-auth");
const mongoose = require("mongoose");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { admin, openAPI } = require("better-auth/plugins");
const { username } = require("better-auth/plugins");
const { jwt } = require("better-auth/plugins");
const { customSession } = require("better-auth/plugins");

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
	throw new Error('MONGODB_URI environment variable is required');
}

// Reuse Mongoose connection to avoid multiple connection pools
// This prevents "Authentication failed" errors and connection pool conflicts
const getDb = () => {
	if (mongoose.connection.readyState !== 1) {
		console.warn('[better-auth] Mongoose not connected, waiting for connection...');
	}
	return mongoose.connection.db;
};

const auth = betterAuth({
	database: mongodbAdapter(getDb),
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

module.exports = { auth };
