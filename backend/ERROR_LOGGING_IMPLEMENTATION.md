# Error Logging Implementation - AMD Store Backend

## Tổng quan

Đã triển khai hệ thống logging tập trung cho backend để theo dõi và xử lý lỗi một cách chuyên nghiệp.

## Các thay đổi chính

### 1. Centralized Logger Utility (`utils/logger.js`)

Đã tạo một utility logger tập trung với các tính năng:

#### Các hàm logging:
- **`logger.info(message, context)`** - Thông tin chung
- **`logger.success(message, context)`** - Thành công 
- **`logger.warn(message, context)`** - Cảnh báo
- **`logger.error(message, error, context)`** - Lỗi với stack trace
- **`logger.debug(message, context)`** - Debug (chỉ development)
- **`logger.critical(message, error, context)`** - Lỗi nghiêm trọng
- **`logger.database(operation, details)`** - Database operations
- **`logger.auth(event, details)`** - Authentication events

#### Các helper functions:
- **`logger.getRequestContext(req)`** - Tạo context từ request (method, url, ip, user, etc.)
- **`logger.unhandledRejection(reason, promise)`** - Log unhandled rejections
- **`logger.uncaughtException(err)`** - Log uncaught exceptions

#### Tính năng:
- ✅ Colored console output với emojis
- ✅ Timestamps ISO format
- ✅ Structured logging với context objects
- ✅ Stack traces trong development mode
- ✅ Request context (method, URL, IP, user agent, origin)

### 2. Server-level Error Handling (`server.js`)

#### Global Error Handlers:
```javascript
// Unhandled Promise Rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.unhandledRejection(reason, promise);
  // Chỉ exit trong development
  if (process.env.NODE_ENV === 'development') {
    process.exit(1);
  }
});

// Uncaught Exception
process.on('uncaughtException', (err) => {
  logger.uncaughtException(err);
  process.exit(1); // Nên exit vì có thể unstable
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
```

#### Express Error Middleware:
- ✅ Log đầy đủ error với request context
- ✅ Giữ CORS headers trong error responses
- ✅ Phân biệt môi trường (dev/production)
- ✅ Status code handling
- ✅ Log 404 requests

### 3. Middleware Updates

#### `middleware/better-auth.js`
- Thay thế `console.error` với `logger.error`
- Log với full request context
- Cải thiện error messages cho:
  - `authenticateUser` - User authentication failures
  - `authenticateAdmin` - Admin authentication failures  
  - `authenticateSeller` - Seller authentication failures

### 4. Database Connection (`lib/database.js`)

- ✅ Log connection success với database info
- ✅ Log connection errors
- ✅ Log disconnection và reconnection events
- ✅ Critical errors cho connection failures

### 5. Route Updates

Đã cập nhật tất cả các route handlers:

#### `routes/orders.js`
- ✅ Thay thế tất cả console.log/error với logger
- ✅ Log order creation flow với debug levels
- ✅ Log validation errors
- ✅ Log database errors
- ✅ Log AppScript push errors
- ✅ Log payment QR generation errors

#### `routes/products.js`
- ✅ Log tất cả errors với request context
- ✅ Phân biệt validation errors (CastError)
- ✅ Log cho tất cả endpoints (get, list, categories)

#### `routes/combos.js`
- ✅ Log combo detection errors
- ✅ Log validation errors cho create/update
- ✅ Log pricing calculation errors
- ✅ Log với combo IDs trong context

#### `routes/upload.js`
- ✅ Log invalid file attempts (warn level)
- ✅ Log upload errors với file context
- ✅ Log delete errors với filename
- ✅ Phân biệt validation errors vs system errors

#### `routes/admin/dashboard.js`
- ✅ Log dashboard stats errors

#### Các admin routes khác
Cần tiếp tục update:
- `routes/admin/orders.js` - 26 console statements
- `routes/admin/products.js` - 7 console statements
- `routes/admin/database.js` - 12 console statements
- `routes/admin/exports.js` - 1 console statement
- `routes/admin/settings.js` - 2 console statements

### 6. Better-Auth Error Handling

Theo documentation của better-auth, có thể thêm error handling:

```javascript
// Server-side API error handling
import { APIError } from "better-auth/api";

try {
  await auth.api.signInEmail({
    body: { email: "", password: "" }
  })
} catch (error) {
  if (error instanceof APIError) {
    logger.error('Auth API error', error, {
      status: error.status,
      message: error.message
    });
  }
}
```

## Cách sử dụng

### Import logger:
```javascript
const logger = require('../utils/logger');
// hoặc
const logger = require('../../utils/logger'); // cho nested routes
```

### Logging errors trong route handlers:
```javascript
router.get('/example', async (req, res) => {
  try {
    // Your code
  } catch (error) {
    logger.error('Error description', error, logger.getRequestContext(req));
    res.status(500).json({
      success: false,
      message: 'User-friendly message'
    });
  }
});
```

### Logging với context:
```javascript
logger.info('Order created', {
  orderCode: order.orderCode,
  totalAmount: order.totalAmount,
  userId: req.user?.id
});

logger.warn('Invalid request', {
  reason: 'Missing required field',
  field: 'email'
});

logger.debug('Processing step', {
  step: 'validation',
  data: someData
});
```

### Logging authentication:
```javascript
logger.auth('User login success', {
  userId: user.id,
  email: user.email,
  ip: req.ip
});

logger.auth('Login failed', {
  email: req.body.email,
  reason: 'Invalid credentials'
});
```

### Logging database operations:
```javascript
logger.database('User created', {
  userId: user.id,
  collection: 'users'
});

logger.database('Query executed', {
  collection: 'orders',
  query: { status: 'pending' },
  results: count
});
```

## Log Levels

1. **DEBUG** (gray 🔍) - Chi tiết kỹ thuật, chỉ trong development
2. **INFO** (blue ℹ) - Thông tin chung về flow
3. **SUCCESS** (green ✓) - Thao tác thành công
4. **WARN** (yellow ⚠) - Cảnh báo, không phải error
5. **ERROR** (red ✗) - Lỗi cần xử lý
6. **CRITICAL** (magenta ⛔) - Lỗi nghiêm trọng

## Best Practices

### ✅ DO:
- Log errors với full context (request info, user info)
- Sử dụng appropriate log level
- Log validation errors ở WARN level
- Log system errors ở ERROR level
- Log critical failures ở CRITICAL level
- Include request context cho API errors
- Log stack traces trong development

### ❌ DON'T:
- Log sensitive data (passwords, tokens, credit cards)
- Log quá nhiều trong production
- Sử dụng console.log/error trực tiếp
- Log passwords hoặc authentication secrets
- Bỏ qua context khi log errors

## Output Examples

### Info Log:
```
ℹ [2024-11-14T10:30:45.123Z] [INFO] Order creation started
{
  "items": 3,
  "useOptimalPricing": true
}
```

### Error Log:
```
✗ [2024-11-14T10:30:46.456Z] [ERROR] Error creating order
{
  "method": "POST",
  "url": "/api/orders",
  "ip": "127.0.0.1",
  "errorName": "ValidationError",
  "errorMessage": "Invalid product ID",
  "stack": "Error: Invalid product ID\n    at ..."
}
```

### Critical Log:
```
⛔ [2024-11-14T10:30:47.789Z] [CRITICAL] Uncaught Exception
{
  "severity": "CRITICAL",
  "errorName": "ReferenceError",
  "errorMessage": "variable is not defined",
  "stack": "...",
  "processInfo": {
    "pid": 12345,
    "uptime": 3600.5,
    "memoryUsage": {...}
  }
}
```

## Environment Variables

Không cần thêm environment variables mới. Logger tự động điều chỉnh:
- **Development**: Full stack traces, debug logs enabled
- **Production**: Limited info, no debug logs, no stack traces for users

## Monitoring & Alerting (Future)

Logger này có thể dễ dàng tích hợp với:
- Winston (file logging)
- Sentry (error tracking)
- Datadog (APM)
- CloudWatch (AWS)
- Elasticsearch (log aggregation)

Chỉ cần wrap logger functions để gửi đến external services.

## Testing

Để test error handling:

```bash
# Development mode - xem full logs
NODE_ENV=development yarn start

# Production mode - xem production logs
NODE_ENV=production yarn start
```

Trigger một số lỗi để test:
1. Invalid order data → Validation error (WARN)
2. Missing database connection → Critical error
3. Invalid product ID → CastError → WARN
4. Server crash → Uncaught exception → CRITICAL

## Next Steps (Optional)

1. ✅ **Hoàn thành**: Core logger + main routes updated
2. 🔄 **Đang làm**: Update remaining admin routes
3. ⏳ **Todo**: Thêm file logging với Winston
4. ⏳ **Todo**: Tích hợp với Sentry cho error tracking
5. ⏳ **Todo**: Metrics và performance monitoring
6. ⏳ **Todo**: Log rotation và archival

## Kết luận

Hệ thống logging mới:
- ✅ Tập trung và consistent
- ✅ Có màu sắc và dễ đọc
- ✅ Context-aware với request info
- ✅ Xử lý unhandled errors
- ✅ Phân biệt môi trường dev/prod
- ✅ Stack traces cho debugging
- ✅ Ready cho external monitoring tools

Không còn silent failures - tất cả errors đều được log đầy đủ!
