const { auth } = require('../lib/auth');

/**
 * Authentication middleware using better-auth
 */
const authenticateUser = async (req, res, next) => {
	try {
		const session = await auth.api.getSession({
			headers: req.headers,
		});

		if (!session) {
			console.log('[AUTH] No session found in authenticateUser');
			return res.status(401).json({
				success: false,
				message: 'Không có session xác thực, truy cập bị từ chối'
			});
		}

		// Add user and session to request
		req.user = session.user;
		req.session = session;
		console.log('[AUTH] User authenticated:', { userId: session.user.id, role: session.user.role });
		next();
	} catch (error) {
		console.error('[AUTH] Auth middleware error:', error);
		console.error('[AUTH] Error details:', {
			message: error.message,
			stack: error.stack,
			headers: req.headers
		});
		return res.status(401).json({
			success: false,
			message: 'Xác thực thất bại'
		});
	}
};/**
 * Authentication middleware for admin routes
 */
const authenticateAdmin = async (req, res, next) => {
	try {
		const session = await auth.api.getSession({
			headers: req.headers,
		});

		if (!session) {
			console.log('[AUTH] No session found in authenticateAdmin');
			return res.status(401).json({
				success: false,
				message: 'Không có session xác thực, truy cập bị từ chối'
			});
		}

		if (!session.user || session.user.role !== 'admin') {
			console.log('[AUTH] User is not admin:', { userId: session.user?.id, role: session.user?.role });
			return res.status(403).json({
				success: false,
				message: 'Truy cập bị từ chối. Chỉ admin mới có thể thực hiện hành động này.'
			});
		}

		// Add admin user and session to request
		req.admin = session.user;
		req.user = session.user;
		req.session = session;
		console.log('[AUTH] Admin authenticated:', { userId: session.user.id, role: session.user.role });
		next();
	} catch (error) {
		console.error('[AUTH] Admin auth middleware error:', error);
		console.error('[AUTH] Error details:', {
			message: error.message,
			stack: error.stack,
			headers: req.headers
		});
		return res.status(401).json({
			success: false,
			message: 'Xác thực admin thất bại'
		});
	}
};/**
 * Authentication middleware for seller routes
 */
const authenticateSeller = async (req, res, next) => {
	try {
		const session = await auth.api.getSession({
			headers: req.headers,
		});

		if (!session) {
			console.log('[AUTH] No session found in authenticateSeller');
			return res.status(401).json({
				success: false,
				message: 'Không có session xác thực, truy cập bị từ chối'
			});
		}

		if (!session.user || (session.user.role !== 'seller' && session.user.role !== 'admin')) {
			console.log('[AUTH] User is not seller or admin:', { userId: session.user?.id, role: session.user?.role });
			return res.status(403).json({
				success: false,
				message: 'Truy cập bị từ chối. Chỉ seller hoặc admin mới có thể thực hiện hành động này.'
			});
		}

		// Add seller user and session to request
		req.seller = session.user;
		req.user = session.user;
		req.session = session;
		console.log('[AUTH] Seller authenticated:', { userId: session.user.id, role: session.user.role });
		next();
	} catch (error) {
		console.error('[AUTH] Seller auth middleware error:', error);
		console.error('[AUTH] Error details:', {
			message: error.message,
			stack: error.stack,
			headers: req.headers
		});
		return res.status(401).json({
			success: false,
			message: 'Xác thực seller thất bại'
		});
	}
}; module.exports = {
	authenticateUser,
	authenticateAdmin,
	authenticateSeller
};
