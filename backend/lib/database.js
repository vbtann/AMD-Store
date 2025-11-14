const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config();

let isConnected = false;
let connectionListenersSet = false;

async function connectDB() {
	// Check if already connected
	if (mongoose.connection.readyState === 1) {
		isConnected = true;
		return mongoose.connection;
	}

	// Check if currently connecting
	if (mongoose.connection.readyState === 2) {
		// Wait for connection to complete
		await new Promise((resolve) => {
			const checkConnection = setInterval(() => {
				if (mongoose.connection.readyState === 1) {
					clearInterval(checkConnection);
					resolve();
				}
			}, 100);
		});
		return mongoose.connection;
	}

	try {
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			throw new Error('MONGODB_URI environment variable is required');
		}

		// Configure connection options to prevent reconnection loops
		const options = {
			// Connection pool settings - reduced to prevent pool exhaustion
			maxPoolSize: 5,
			minPoolSize: 1,
			serverSelectionTimeoutMS: 10000,
			socketTimeoutMS: 45000,
			connectTimeoutMS: 10000,
			// Heartbeat settings
			heartbeatFrequencyMS: 10000,
			// Disable auto-index in production
			autoIndex: process.env.NODE_ENV !== 'production',
		};

		// Set up event handlers BEFORE connecting
		if (!connectionListenersSet) {
			connectionListenersSet = true;

			// Only log significant errors, not transient ones
			mongoose.connection.on('error', (err) => {
				// Ignore minor errors during normal operation
				if (err.name !== 'MongoNetworkError' || !isConnected) {
					logger.error('MongoDB connection error', err);
				}
			});

			// Track intentional disconnects
			let intentionalDisconnect = false;

			mongoose.connection.on('disconnecting', () => {
				intentionalDisconnect = true;
			});

			mongoose.connection.on('disconnected', () => {
				if (isConnected && !intentionalDisconnect) {
					logger.warn('MongoDB disconnected unexpectedly');
				}
				isConnected = false;
				intentionalDisconnect = false;
			});

			mongoose.connection.on('connected', () => {
				if (!isConnected) {
					isConnected = true;
				}
			});

			mongoose.connection.on('reconnected', () => {
				if (!isConnected) {
					logger.success('MongoDB reconnected');
					isConnected = true;
				}
			});
		}

		// Connect to MongoDB
		await mongoose.connect(mongoUri, options);

		isConnected = true;
		logger.database('MongoDB connected successfully via Mongoose', {
			host: mongoose.connection.host,
			name: mongoose.connection.name
		});

		return mongoose.connection;
	} catch (error) {
		logger.critical('MongoDB connection failed', error);
		isConnected = false;
		throw error;
	}
}

function getDb() {
	if (!isConnected || !mongoose.connection.db) {
		throw new Error('Database not connected. Call connectDB() first.');
	}
	return mongoose.connection.db;
}

function closeDB() {
	return mongoose.connection.close();
}

module.exports = { connectDB, getDb, closeDB };