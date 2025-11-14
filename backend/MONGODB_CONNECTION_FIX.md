# MongoDB Authentication & Connection Loop Fix

## Vấn đề gặp phải

### 1. **Authentication Failed (Error Code 18)**
```
MongoServerError: Authentication failed.
errorCode: 18
codeName: 'AuthenticationFailed'
```

**Nguyên nhân**: Mismatch giữa credentials trong `prod.compose.yml` và `.env`

- **prod.compose.yml** (default values):
  ```yaml
  MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME:-admin}
  MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:-password123}
  ```

- **.env** (actual values):
  ```env
  MONGO_INITDB_ROOT_USERNAME=amdadmin
  MONGO_INITDB_ROOT_PASSWORD=amdpassword123
  ```

Khi MongoDB container khởi động lần đầu, nó sử dụng default values (`admin/password123`), nhưng backend cố kết nối bằng credentials trong `.env` (`amdadmin/amdpassword123`).

### 2. **Reconnection Loop**
```
[WARNING] MongoDB disconnected
[SUCCESS] MongoDB reconnected
[WARNING] MongoDB disconnected
[SUCCESS] MongoDB reconnected
...
```

**Nguyên nhân**: Hai MongoDB connections riêng biệt:
1. **Mongoose connection** (`lib/database.js`) - Cho models và queries
2. **Native MongoDB client** (`lib/auth.js`) - Cho better-auth adapter

Hai connections này không chia sẻ connection pool, gây ra:
- Connection conflicts
- Event handler duplicates
- Multiple connection attempts

### 3. **Init-database.js Failed**
```
❌ Error initializing database: MongoServerError: Authentication failed.
```

**Nguyên nhân**: Script chạy trước khi MongoDB ready và có đúng credentials.

## Các sửa đổi đã thực hiện

### ✅ 1. Fix `prod.compose.yml` - Consistent Credentials

**File**: `prod.compose.yml`

```yaml
# BEFORE:
mongodb:
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME:-admin}  # Wrong default
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:-password123}  # Wrong default
    MONGO_INITDB_DATABASE: ${MONGO_INITDB_DATABASE:-minipreorder}  # Wrong default

# AFTER:
mongodb:
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_INITDB_ROOT_USERNAME:-amdadmin}  # Match .env
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_INITDB_ROOT_PASSWORD:-amdpassword123}  # Match .env
    MONGO_INITDB_DATABASE: ${MONGO_INITDB_DATABASE:-amdstore}  # Match .env
```

**Lý do**: Đảm bảo default values match với values trong `.env` file.

### ✅ 2. Fix `lib/database.js` - Better Connection Configuration

**File**: `backend/lib/database.js`

**Cải tiến**:

1. **Better connection state tracking**:
```javascript
if (isConnected && mongoose.connection.readyState === 1) {
  // Check both flag and actual connection state
}
```

2. **Proper Mongoose options**:
```javascript
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
```

3. **Event handlers only once**:
```javascript
if (!mongoose.connection._setupEventHandlers) {
  mongoose.connection._setupEventHandlers = true;
  // Set up events only once
}
```

**Lý do**: Prevent duplicate event handlers và connection pool issues.

### ✅ 3. Fix `start.js` - Proper Health Check

**File**: `backend/start.js`

**BEFORE**:
```javascript
async function waitForMongoDB() {
  while (retries < maxRetries) {
    try {
      await connectDB();  // Creates full connection
      return true;
    } catch (error) {
      // ...
    }
  }
}
```

**AFTER**:
```javascript
async function waitForMongoDB() {
  while (retries < maxRetries) {
    try {
      const mongoose = require('mongoose');
      const mongoUri = process.env.MONGODB_URI;
      
      // Temporary connection just for health check
      const conn = await mongoose.createConnection(mongoUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      }).asPromise();
      
      await conn.close();  // Close immediately
      return true;
    } catch (error) {
      // ...
    }
  }
}
```

**Lý do**: 
- Tránh tạo multiple persistent connections
- Health check nhanh hơn
- Không conflict với main connection

### ✅ 4. Fix `lib/auth.js` - Better-Auth MongoDB Client

**File**: `backend/lib/auth.js`

**Cải tiến**:

1. **Proper connection pooling**:
```javascript
const client = new MongoClient(MONGODB_URI, {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 10000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true
});
```

2. **Explicit connection management**:
```javascript
let isClientConnected = false;
const connectClient = async () => {
  if (!isClientConnected) {
    await client.connect();
    isClientConnected = true;
    logger.info('Better-auth MongoDB client connected');
  }
};

// Initialize on module load
connectClient().catch(err => {
  logger.critical('Failed to initialize better-auth MongoDB client', err);
});
```

3. **Graceful shutdown**:
```javascript
const closeAuthClient = async () => {
  if (isClientConnected) {
    await client.close();
    isClientConnected = false;
    logger.info('Better-auth MongoDB client closed');
  }
};

process.on('SIGTERM', closeAuthClient);
process.on('SIGINT', closeAuthClient);
```

**Lý do**: 
- Better-auth cần native MongoDB client riêng
- Proper connection pooling tránh conflicts
- Graceful shutdown cleanup connections

## Tóm tắt thay đổi

| File | Thay đổi | Mục đích |
|------|----------|----------|
| `prod.compose.yml` | Fix default credentials | Match với .env values |
| `lib/database.js` | Better Mongoose config | Prevent reconnection loops |
| `start.js` | Temporary health check connection | Avoid persistent connections |
| `lib/auth.js` | Proper MongoClient pooling | Better-auth stability |

## Kết quả mong đợi

### ✅ Trước khi fix:
```
[CRITICAL] MongoDB connection failed - Authentication failed
MongoDB not ready, retrying... (1/30)
[CRITICAL] MongoDB connection failed - Authentication failed
MongoDB not ready, retrying... (2/30)
...
[WARNING] MongoDB disconnected
[SUCCESS] MongoDB reconnected
[WARNING] MongoDB disconnected
[SUCCESS] MongoDB reconnected
```

### ✅ Sau khi fix:
```
Waiting for MongoDB to be ready...
[OK] MongoDB is ready
Waiting for MinIO to be ready...
[OK] MinIO is ready and bucket initialized
Initializing database...
[INFO] Database: MongoDB connected successfully via Mongoose
✅ Connected to MongoDB via Mongoose
✅ Database initialized successfully!
Starting server...
[INFO] Starting server...
[INFO] Database: MongoDB connected successfully via Mongoose
[SUCCESS] Database connected successfully
[SUCCESS] Server started successfully
```

## Deployment Instructions

### 1. **Rebuild và restart containers**:

```bash
# Stop current containers
docker compose -f prod.compose.yml down

# Remove MongoDB data volume (nếu muốn fresh start)
docker volume rm amdstore_mongodb_data

# Rebuild và start
docker compose -f prod.compose.yml up --build -d
```

### 2. **Verify logs**:

```bash
# Watch backend logs
docker logs -f amdstore_backend

# Should see:
# - MongoDB connected successfully
# - Better-auth MongoDB client connected
# - No reconnection loops
# - No authentication errors
```

### 3. **Health check**:

```bash
# Check backend health
curl http://localhost:5000/health

# Check if admin user was created
curl http://localhost:5000/api/auth/session
```

## Monitoring

### Signs of success:
- ✅ No "Authentication failed" errors
- ✅ No reconnection loops
- ✅ Database initialization completes
- ✅ Server starts successfully
- ✅ Single connection log per service

### Signs of issues:
- ❌ Authentication failed errors
- ❌ Continuous reconnection loops
- ❌ Init-database fails
- ❌ Multiple connection attempts

## Technical Details

### Why two MongoDB connections?

1. **Mongoose (ODM)**: 
   - Used for: Schema validation, models, queries
   - Features: Type safety, middleware, virtuals
   - File: `lib/database.js`

2. **Native MongoDB Client**:
   - Used for: Better-auth adapter
   - Features: Direct database access, transactions
   - File: `lib/auth.js`
   - Requirement: Better-auth needs native MongoDB client

### Connection Pooling

Both connections now use proper pooling:
```javascript
{
  maxPoolSize: 10,      // Max 10 connections
  minPoolSize: 2,       // Keep 2 alive
  maxIdleTimeMS: 10000, // Close idle after 10s
  retryWrites: true,    // Auto retry writes
  retryReads: true      // Auto retry reads
}
```

### Why not share connections?

Better-auth's MongoDB adapter requires a native `mongodb.Db` instance, not a Mongoose connection. While Mongoose uses MongoDB driver internally, it wraps it with its own layer. Better-auth needs direct access to enable:
- Transactions (if client is provided)
- Direct collection access
- Better-auth specific operations

## References

- [Better-Auth MongoDB Adapter Documentation](https://www.better-auth.com/docs/adapters/mongo)
- [Mongoose Connection Options](https://mongoosejs.com/docs/connections.html)
- [MongoDB Connection Pooling](https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/connection-options/)

## Troubleshooting

### Issue: Still seeing authentication errors

**Solution**: 
1. Stop all containers
2. Remove MongoDB volume: `docker volume rm amdstore_mongodb_data`
3. Verify `.env` has correct credentials
4. Restart: `docker compose -f prod.compose.yml up -d`

### Issue: Still seeing reconnection loops

**Solution**:
1. Check for multiple `connectDB()` calls
2. Verify event handlers are set up only once
3. Check for duplicate imports of `lib/database.js`

### Issue: Better-auth errors

**Solution**:
1. Check `lib/auth.js` client connection
2. Verify MONGODB_URI is correct
3. Check better-auth client connection logs

## Next Steps (Optional)

- [ ] Implement connection retry logic in auth.js
- [ ] Add connection metrics monitoring
- [ ] Implement connection pool monitoring
- [ ] Add database connection alerts
- [ ] Optimize connection pool sizes based on load
