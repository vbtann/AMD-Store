const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config();

let isConnected = false;

async function connectDB() {
	if (isConnected) {
		logger.info('MongoDB already connected via Mongoose');
		return mongoose.connection;
	}

	try {
		const mongoUri = process.env.MONGODB_URI;
		if (!mongoUri) {
			throw new Error('MONGODB_URI environment variable is required');
		}

		await mongoose.connect(mongoUri);

		isConnected = true;
		logger.database('MongoDB connected successfully via Mongoose', {
			host: mongoose.connection.host,
			name: mongoose.connection.name
		});

		// Handle connection events
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