/**
 * Centralized logging utility for better error tracking and debugging
 * Provides structured logging with timestamps and context information
 */

const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m'
};

/**
 * Format timestamp in ISO format with milliseconds
 */
const getTimestamp = () => {
	return new Date().toISOString();
};

/**
 * Format log entry with timestamp and level
 */
const formatLogEntry = (level, message, context = {}) => {
	const timestamp = getTimestamp();
	const contextStr = Object.keys(context).length > 0
		? `\n${JSON.stringify(context, null, 2)}`
		: '';

	return `[${timestamp}] [${level}] ${message}${contextStr}`;
};

/**
 * Log info message
 */
const info = (message, context = {}) => {
	console.log(
		`${colors.blue}ℹ ${formatLogEntry('INFO', message, context)}${colors.reset}`
	);
};

/**
 * Log success message
 */
const success = (message, context = {}) => {
	console.log(
		`${colors.green}✓ ${formatLogEntry('SUCCESS', message, context)}${colors.reset}`
	);
};

/**
 * Log warning message
 */
const warn = (message, context = {}) => {
	console.warn(
		`${colors.yellow}⚠ ${formatLogEntry('WARNING', message, context)}${colors.reset}`
	);
};

/**
 * Log error message with stack trace
 */
const error = (message, err = null, context = {}) => {
	const errorContext = {
		...context,
		...(err && {
			errorName: err.name,
			errorMessage: err.message,
			errorCode: err.code,
			...(process.env.NODE_ENV === 'development' && { stack: err.stack })
		})
	};

	console.error(
		`${colors.red}✗ ${formatLogEntry('ERROR', message, errorContext)}${colors.reset}`
	);
};

/**
 * Log debug message (only in development)
 */
const debug = (message, context = {}) => {
	if (process.env.NODE_ENV === 'development') {
		console.log(
			`${colors.gray}🔍 ${formatLogEntry('DEBUG', message, context)}${colors.reset}`
		);
	}
};

/**
 * Log HTTP request
 */
const request = (req) => {
	const timestamp = getTimestamp();
	console.log(
		`${colors.cyan}→ [${timestamp}] ${req.method} ${req.url}${colors.reset}`,
		{
			ip: req.ip,
			userAgent: req.get('user-agent'),
			origin: req.get('origin')
		}
	);
};

/**
 * Log HTTP response
 */
const response = (req, res, duration) => {
	const timestamp = getTimestamp();
	const statusColor = res.statusCode >= 400 ? colors.red : colors.green;
	console.log(
		`${statusColor}← [${timestamp}] ${req.method} ${req.url} ${res.statusCode} (${duration}ms)${colors.reset}`
	);
};

/**
 * Log database operation
 */
const database = (operation, details = {}) => {
	info(`Database: ${operation}`, details);
};

/**
 * Log authentication event
 */
const auth = (event, details = {}) => {
	info(`Auth: ${event}`, details);
};

/**
 * Log critical error that requires immediate attention
 */
const critical = (message, err = null, context = {}) => {
	const errorContext = {
		...context,
		severity: 'CRITICAL',
		...(err && {
			errorName: err.name,
			errorMessage: err.message,
			errorCode: err.code,
			stack: err.stack
		})
	};

	console.error(
		`${colors.magenta}⛔ ${formatLogEntry('CRITICAL', message, errorContext)}${colors.reset}`
	);
};

/**
 * Create request context for error logging
 */
const getRequestContext = (req) => {
	return {
		method: req.method,
		url: req.url,
		path: req.path,
		ip: req.ip,
		userAgent: req.get('user-agent'),
		origin: req.get('origin'),
		referer: req.get('referer'),
		...(req.user && { userId: req.user.id }),
		...(req.session && { sessionId: req.session.id })
	};
};

/**
 * Log unhandled rejection
 */
const unhandledRejection = (reason, promise) => {
	critical('Unhandled Promise Rejection', reason, {
		promise: promise.toString(),
		reason: reason?.message || reason
	});
};

/**
 * Log uncaught exception
 */
const uncaughtException = (err) => {
	critical('Uncaught Exception', err, {
		processInfo: {
			pid: process.pid,
			uptime: process.uptime(),
			memoryUsage: process.memoryUsage()
		}
	});
};

module.exports = {
	info,
	success,
	warn,
	error,
	debug,
	request,
	response,
	database,
	auth,
	critical,
	getRequestContext,
	unhandledRejection,
	uncaughtException
};
