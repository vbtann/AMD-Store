const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config();

let isConnected = false;
let connectionListenersSet = false;

async function connectDB() {
	if (isConnected && mongoose.connection.readyState === 1) {
		logger.info('MongoDB already connected via Mongoose');
		return mongoose.connection;
	}

	try {
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			throw new Error('MONGODB_URI environment variable is required');
		}

		// Configure connection options to prevent reconnection loops
		const options = {
			// Connection pool settings
			maxPoolSize: 10,
			minPoolSize: 2,
			serverSelectionTimeoutMS: 10000,
			socketTimeoutMS: 45000,
			// Disable auto-reconnect to prevent loops
			// We handle reconnection at application level
			autoIndex: process.env.NODE_ENV !== 'production',
		};

		await mongoose.connect(mongoUri, options);

		isConnected = true;
		logger.database('MongoDB connected successfully via Mongoose', {
			host: mongoose.connection.host,
			name: mongoose.connection.name
		});

		// Set up connection event handlers only once
		if (!connectionListenersSet) {
			connectionListenersSet = true;

			mongoose.connection.on('error', (err) => {
				logger.error('MongoDB connection error', err);
				isConnected = false;
			});

			mongoose.connection.on('disconnected', () => {
				if (isConnected) {
					logger.warn('MongoDB disconnected unexpectedly');
					isConnected = false;
				}
			});

			mongoose.connection.on('reconnected', () => {
				if (!isConnected) {
					logger.success('MongoDB reconnected');
					isConnected = true;
				}
			});

			mongoose.connection.on('connected', () => {
				if (!isConnected) {
					logger.info('MongoDB connection established');
					isConnected = true;
				}
			});
		}

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