require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const { auth } = require('./lib/auth');
const { connectDB } = require('./lib/database');
const { toNodeHandler } = require('better-auth/node');
const logger = require('./utils/logger');


const app = express();

// Trust proxy configuration - secure setup for rate limiting
// Only trust first proxy (recommended for most deployments)
// Set to false if not behind a proxy, or configure specific trusted IPs
app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);

// Security middleware
app.use(helmet({
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			connectSrc: [
				"'self'",
				"https://api.store.sab.edu.vn",
				"https://api.lanyard.sab.edu.vn",
				"https://store.sab.edu.vn",
				"https://fonts.googleapis.com",
				"https://fonts.gstatic.com",
				"https://cdnjs.cloudflare.com"
			],
			scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
			styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
			fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
			imgSrc: ["'self'", "data:", "blob:", "https:"],
			manifestSrc: ["'self'"],
			objectSrc: ["'none'"],
			baseUri: ["'self'"],
			formAction: ["'self'"],
			frameAncestors: ["'none'"],
			upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
		}
	}
}));
app.use(compression());

// CORS configuration - Must be before Better Auth handler
const corsOptions = {
	origin: function (origin, callback) {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);

		// Support multiple origins from environment variable (comma-separated)
		const allowedOrigins = [
			...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
			'http://store.sab.edu.vn',
			'https://store.sab.edu.vn',
			'https://api.store.sab.edu.vn',
			'https://lanyard.sab.edu.vn',
			'https://api.lanyard.sab.edu.vn',
			'http://localhost:3000', // Development
			'http://127.0.0.1:3000'  // Development
		];

		if (allowedOrigins.includes(origin)) {
			return callback(null, true);
		}

		console.warn(`[CORS] Blocked origin: ${origin}`);
		callback(new Error('Not allowed by CORS ${origin}}'));
	},
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
	exposedHeaders: ['Set-Cookie'],
	preflightContinue: false,
	optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Handle preflight OPTIONS requests explicitly
app.options('*', (req, res) => {
	res.header('Access-Control-Allow-Origin', req.headers.origin);
	res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
	res.header('Access-Control-Allow-Credentials', 'true');
	res.sendStatus(200);
});

// Body parsing middleware - Must be BEFORE Better Auth handler
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Global CORS headers middleware for all responses
app.use((req, res, next) => {
	const allowedOrigins = [
		...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
		'https://store.sab.edu.vn',
		'https://api.store.sab.edu.vn',
		'http://localhost:3000',
		'http://127.0.0.1:3000'
	];

	const origin = req.headers.origin;
	if (!origin || allowedOrigins.includes(origin)) {
		res.header('Access-Control-Allow-Origin', origin || '*');
		res.header('Access-Control-Allow-Credentials', 'true');
		res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
	}

	next();
});

// Better-auth API routes - Must be AFTER body parsing middleware
app.all('/api/auth/*', toNodeHandler(auth));

// Routes
app.use('/api/upload', require('./routes/upload'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/combos', require('./routes/combos'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/settings', require('./routes/admin/settings'));
app.use('/api/seller', require('./routes/seller'));

// Health check
app.get('/health', (req, res) => {
	res.status(200).json({
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: process.uptime()
	});
});



// Error handling middleware
app.use((err, req, res, next) => {
	// Log error with full context
	logger.error('Unhandled error in request', err, logger.getRequestContext(req));

	// Ensure CORS headers are present in error responses
	const allowedOrigins = [
		...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
		'https://store.sab.edu.vn',
		'https://api.store.sab.edu.vn',
		'http://localhost:3000',
		'http://127.0.0.1:3000'
	];

	const origin = req.headers.origin;
	if (!origin || allowedOrigins.includes(origin)) {
		res.header('Access-Control-Allow-Origin', origin || '*');
		res.header('Access-Control-Allow-Credentials', 'true');
		res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
	}

	// Determine error status code
	const statusCode = err.statusCode || err.status || 500;

	// Send appropriate error response
	res.status(statusCode).json({
		success: false,
		message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
		error: process.env.NODE_ENV === 'development' ? {
			message: err.message,
			stack: err.stack,
			name: err.name,
			code: err.code
		} : {}
	});
});

// 404 handler
app.use('*', (req, res) => {
	// Log 404 requests for monitoring
	logger.warn('Route not found', logger.getRequestContext(req));

	// Ensure CORS headers are present in 404 responses
	const allowedOrigins = [
		...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : []),
		'https://store.sab.edu.vn',
		'https://api.store.sab.edu.vn',
		'http://localhost:3000',
		'http://127.0.0.1:3000'
	];

	const origin = req.headers.origin;
	if (!origin || allowedOrigins.includes(origin)) {
		res.header('Access-Control-Allow-Origin', origin || '*');
		res.header('Access-Control-Allow-Credentials', 'true');
		res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
		res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With');
	}

	res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
	logger.unhandledRejection(reason, promise);
	// Don't exit the process in production, just log
	if (process.env.NODE_ENV === 'development') {
		process.exit(1);
	}
});

process.on('uncaughtException', (err) => {
	logger.uncaughtException(err);
	// For uncaught exceptions, we should exit
	process.exit(1);
});

process.on('SIGTERM', () => {
	logger.info('SIGTERM signal received: closing HTTP server');
	process.exit(0);
});

process.on('SIGINT', () => {
	logger.info('SIGINT signal received: closing HTTP server');
	process.exit(0);
});

// Start server with database connection
async function startServer() {
	try {
		logger.info('Starting server...', {
			environment: process.env.NODE_ENV,
			nodeVersion: process.version
		});

		// Connect to MongoDB via Mongoose
		await connectDB();
		logger.success('Database connected successfully');

		app.listen(PORT, () => {
			logger.success('Server started successfully', {
				port: PORT,
				environment: process.env.NODE_ENV,
				apiUrl: `http://localhost:${PORT}/api`
			});
		});
	} catch (error) {
		logger.critical('Failed to start server', error, {
			processInfo: {
				pid: process.pid,
				uptime: process.uptime()
			}
		});
		process.exit(1);
	}
}

startServer();
