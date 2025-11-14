#!/usr/bin/env node

const { spawn } = require('child_process');
const { connectDB } = require('./lib/database');
const { initializeBucket } = require('./lib/minio');

async function waitForMongoDB() {
	console.log('Waiting for MongoDB to be ready...');
	const maxRetries = 30;
	let retries = 0;

	while (retries < maxRetries) {
		try {
			await connectDB();
			console.log('[OK] MongoDB is ready');
			return true;
		} catch (error) {
			retries++;
			console.log(`MongoDB not ready, retrying... (${retries}/${maxRetries})`);
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	}

	throw new Error('MongoDB failed to become ready within timeout');
}

async function initializeDatabase() {
	console.log('Initializing database...');

	return new Promise((resolve, reject) => {
		const initProcess = spawn('node', ['init-database.js'], {
			stdio: 'inherit',
			env: process.env
		});

		initProcess.on('close', (code) => {
			if (code === 0) {
				console.log('[OK] Database initialized successfully');
				resolve();
			} else {
				console.log('[WARN] Database initialization completed with warnings or was skipped');
				resolve(); // Don't fail if init has warnings
			}
		});

		initProcess.on('error', (error) => {
			console.error('[ERROR] Database initialization error:', error);
			reject(error);
		});
	});
}

async function waitForMinIO() {
	console.log('Waiting for MinIO to be ready...');
	const maxRetries = 30;
	let retries = 0;

	while (retries < maxRetries) {
		try {
			await initializeBucket();
			console.log('[OK] MinIO is ready and bucket initialized');
			return true;
		} catch (error) {
			retries++;
			console.log(`MinIO not ready, retrying... (${retries}/${maxRetries})`);
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
	}

	throw new Error('MinIO failed to become ready within timeout');
}

async function startServer() {
	console.log('Starting server...');

	const serverProcess = spawn('node', ['server.js'], {
		stdio: 'inherit',
		env: {
			...process.env,  // Spread all environment variables
			// Explicitly pass critical variables
			NODE_ENV: process.env.NODE_ENV,
			CORS_ORIGIN: process.env.CORS_ORIGIN,
			PORT: process.env.PORT,
			MONGODB_URI: process.env.MONGODB_URI,
			JWT_SECRET: process.env.JWT_SECRET,
			BASE_URL: process.env.BASE_URL,
			ADMIN_USERNAME: process.env.ADMIN_USERNAME,
			ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
			ADMIN_EMAIL: process.env.ADMIN_EMAIL,
			APPSCRIPT_URL: process.env.APPSCRIPT_URL
		}
	});

	serverProcess.on('error', (error) => {
		console.error('❌ Server start error:', error);
		process.exit(1);
	});

	serverProcess.on('exit', (code, signal) => {
		console.log(`Server process exited with code ${code} and signal ${signal}`);
		if (code !== 0) {
			console.error('❌ Server exited unexpectedly');
			process.exit(1);
		}
	});

	// Forward signals to server process
	process.on('SIGTERM', () => {
		console.log('Received SIGTERM, shutting down gracefully');
		serverProcess.kill('SIGTERM');
	});
	process.on('SIGINT', () => {
		console.log('Received SIGINT, shutting down gracefully');
		serverProcess.kill('SIGINT');
	});
}

async function main() {
	try {
		await waitForMongoDB();
		await waitForMinIO();
		await initializeDatabase();
		await startServer();
	} catch (error) {
		console.error('❌ Startup failed:', error);
		process.exit(1);
	}
}

main();
