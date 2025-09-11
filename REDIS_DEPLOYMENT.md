# Redis-Based Distributed Rate Limiting Setup

This application now supports Redis-based distributed rate limiting for multi-server classroom deployments using **node-redis v5**. The system automatically falls back to in-memory rate limiting when Redis is not available.

## Key Features

- ✅ **node-redis v5 compatibility** - Proper configuration format and connection handling
- ✅ **Production-ready headers** - Includes `Retry-After` and Unix timestamps  
- ✅ **Clean key generation** - No double prefixing (`student_login:ip` format)
- ✅ **Bounded reconnection** - Max 3 attempts with exponential backoff, then graceful fallback
- ✅ **Log throttling** - Prevents Redis connection error spam

## Development Environment

In development, the application will attempt to connect to Redis but gracefully fall back to in-memory storage if Redis is not available. You'll see clean, throttled logs:

```
Redis Configuration:
  - Configured: false
  - Has URL: false
  - Has Host: false
  - Will attempt connection: false
  - Fallback to in-memory: true
Attempting to connect to Redis...
Redis connection failed, using in-memory fallback: Redis connection timeout (5s)
Rate limiter status: { redis: false, inMemoryCount: 0 }
```

**Note**: Connection attempts are limited to 3 retries with exponential backoff to prevent log spam.

## Production Deployment with Redis

### Option 1: Using External Redis Service (Recommended)

#### Redis Cloud (RedisLabs)
1. Sign up for [Redis Cloud](https://app.redislabs.com)
2. Create a new database
3. Copy the Redis URL from the configuration
4. Set environment variable:
   ```bash
   REDIS_URL=rediss://username:password@redis-endpoint:port
   ```

#### Upstash Redis (Serverless-friendly)
1. Sign up for [Upstash](https://upstash.com)
2. Create a new Redis database
3. Copy the Redis URL
4. Set environment variable:
   ```bash
   UPSTASH_REDIS_URL=rediss://username:password@redis-endpoint:port
   ```

#### AWS ElastiCache
1. Create an ElastiCache Redis cluster
2. Configure security groups for access
3. Set environment variable:
   ```bash
   REDIS_URL=redis://your-cluster.cache.amazonaws.com:6379
   ```

### Option 2: Individual Configuration Variables

If you don't have a Redis URL, you can configure using individual variables:

```bash
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-password
REDIS_DB=0
```

### Supported Environment Variables

The system checks for these environment variables in order:

1. `REDIS_URL` - Complete Redis URL (preferred)
2. `UPSTASH_REDIS_URL` - Upstash Redis URL
3. `REDISCLOUD_URL` - Redis Cloud URL  
4. `REDISTOGO_URL` - Redis To Go URL
5. `REDISLAB_URL` - Redis Labs URL
6. Individual variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`

## Rate Limiting Configuration

### Current Settings
- **Window**: 15 minutes
- **Max Attempts**: 5 per IP address
- **Scope**: Student login PIN attempts

### How It Works

#### With Redis (Production)
```
Server 1 ←→ Redis ←→ Server 2
    ↑                    ↑
 Student A          Student B
```
- Rate limits are shared across all server instances
- Data persists across server restarts
- Consistent protection against distributed attacks

#### Without Redis (Development)
```
Server 1 (in-memory)    Server 2 (in-memory)
    ↑                        ↑
 Student A                Student B
```
- Each server maintains its own rate limits
- Limits reset on server restart
- Students could potentially bypass limits by hitting different servers

## Testing Rate Limiting

### Manual Testing
You can test rate limiting by making multiple rapid requests to the student login endpoint:

```bash
# Make 6 rapid requests (should trigger rate limiting after 5)
for i in {1..6}; do
  curl -X POST http://localhost:5000/api/student-login \
    -H "Content-Type: application/json" \
    -d '{"pin":"1234","instructorId":"test"}' \
    -w "\nStatus: %{http_code}\n"
done
```

### Expected Response Headers
When rate limiting is active, you'll see these production-ready headers:
```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1724882100
X-RateLimit-Used: 3
X-RateLimit-Window: 900
```
**Note**: `X-RateLimit-Reset` now uses Unix timestamp format for better client compatibility.

### Rate Limit Exceeded Response
When rate limited (HTTP 429), the response includes standard `Retry-After` header:
```json
{
  "message": "Too many login attempts, please try again later",
  "retryAfter": 847,
  "retryAfterMs": 847000
}
```
**Headers included**:
- `Retry-After: 847` (seconds until reset, HTTP standard)
- `X-RateLimit-Reset: 1724882100` (Unix timestamp)

## Monitoring

### Application Startup Logs
Check these logs during application startup:

```
# With Redis configured
Redis Configuration:
  - Configured: true
  - Has URL: true
  - Will attempt connection: true
Attempting to connect to Redis...
Redis client connected successfully
Rate limiter status: { redis: true, inMemoryCount: 0 }

# Without Redis (fallback)
Redis Configuration:
  - Configured: false
  - Will attempt connection: false
  - Fallback to in-memory: true
Rate limiter status: { redis: false, inMemoryCount: 0 }
```

### Health Check Endpoint
You can check the rate limiter status programmatically:

```javascript
// In your application code
const status = studentLoginRateLimit.getStatus();
console.log('Rate limiter status:', status);
// { redis: true, inMemoryCount: 0 }  // Redis working
// { redis: false, inMemoryCount: 5 } // Fallback mode
```

## Troubleshooting

### Common Issues

#### Redis Connection Errors
```
Redis connection failed, using in-memory fallback: Redis connection timeout (5s)
```
- **Solution**: Redis is not available. The app automatically falls back to in-memory storage.
- **For Production**: Ensure Redis service is running and accessible.
- **Note**: Connection attempts are bounded (max 3 retries) to prevent log spam.

#### Authentication Errors
```
Redis client error: NOAUTH Authentication required
```
- **Solution**: Set `REDIS_PASSWORD` environment variable or include password in `REDIS_URL`.

#### SSL/TLS Errors
```
Redis client error: unable to verify the first certificate
```
- **Solution**: Use `rediss://` (with SSL) in your Redis URL for secure connections.

### Performance Considerations

- **Memory Usage**: Redis-based rate limiting uses minimal memory (only active rate limit keys)
- **Network Latency**: Each rate limit check requires a Redis round-trip (~1-5ms typically)
- **Fallback Performance**: In-memory fallback has near-zero latency but no coordination

## Deployment Checklist

- [ ] Redis service is provisioned and accessible
- [ ] `REDIS_URL` or equivalent environment variable is set
- [ ] Redis connection is tested and working
- [ ] Rate limiting is verified to work across multiple server instances
- [ ] Monitoring is in place for Redis connectivity
- [ ] Fallback behavior is acceptable for your use case

## Security Notes

- Redis URLs often contain passwords - treat them as secrets
- Use SSL/TLS connections (`rediss://`) in production
- Consider Redis AUTH for additional security
- Monitor for unusual rate limiting patterns that might indicate attacks