const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config();

let isConnected = false;

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

		// Configure mongoose to prevent multiple connection attempts
		mongoose.set('strictQuery', false);

		// Connect with proper options to prevent connection issues
		await mongoose.connect(mongoUri, {
			serverSelectionTimeoutMS: 5000,
			socketTimeoutMS: 45000,
			maxPoolSize: 10,
			minPoolSize: 2,
			maxIdleTimeMS: 10000,
			retryWrites: true,
			retryReads: true,
			autoIndex: process.env.NODE_ENV !== 'production'
		});

		isConnected = true;
		logger.database('MongoDB connected successfully via Mongoose', {
			host: mongoose.connection.host,
			name: mongoose.connection.name,
			readyState: mongoose.connection.readyState
		});

		// Set up connection event handlers only once
		if (!mongoose.connection._setupEventHandlers) {
			mongoose.connection._setupEventHandlers = true;

			mongoose.connection.on('error', (err) => {
				logger.error('MongoDB connection error', err);
				isConnected = false;
			});

			mongoose.connection.on('disconnected', () => {
				logger.warn('MongoDB disconnected');
				isConnected = false;
			});

			mongoose.connection.on('reconnected', () => {
				logger.success('MongoDB reconnected');
				isConnected = true;
			});

			mongoose.connection.on('close', () => {
				logger.info('MongoDB connection closed');
				isConnected = false;
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