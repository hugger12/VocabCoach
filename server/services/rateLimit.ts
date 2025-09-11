import { createClient, RedisClientType } from 'redis';
import { getRedisConfig, logRedisConfig } from '../config/redis.js';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  count: number;
  resetTime: number;
  remainingAttempts: number;
}

interface AttemptData {
  count: number;
  resetTime: number;
}

export class DistributedRateLimit {
  private redisClient: RedisClientType | null = null;
  private fallbackStorage: Map<string, AttemptData> = new Map();
  private isRedisAvailable = false;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      keyPrefix: 'rate_limit:',
      ...config
    };
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      // Log Redis configuration for debugging
      logRedisConfig();
      
      // Get Redis configuration (now uses proper node-redis v5 format)
      const redisConfig = getRedisConfig();
      
      console.log('Attempting to connect to Redis...');
      
      this.redisClient = createClient(redisConfig);

      this.redisClient.on('error', (err) => {
        // Throttle error logging to prevent spam
        if (this.isRedisAvailable) {
          console.warn('Redis client error (switching to in-memory fallback):', err.message);
        }
        this.isRedisAvailable = false;
      });

      this.redisClient.on('connect', () => {
        console.log('Redis client connected successfully');
        this.isRedisAvailable = true;
      });

      this.redisClient.on('disconnect', () => {
        if (this.isRedisAvailable) {
          console.warn('Redis client disconnected, switching to in-memory storage');
        }
        this.isRedisAvailable = false;
      });

      // Test connection with timeout using Promise race
      const connectPromise = this.redisClient.connect().then(() => this.redisClient?.ping());
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Redis connection timeout (5s)')), 5000);
      });

      await Promise.race([connectPromise, timeoutPromise]);
      
      this.isRedisAvailable = true;
      console.log('Redis connection established successfully');
    } catch (error) {
      console.warn('Redis connection failed, using in-memory fallback:', error instanceof Error ? error.message : 'Unknown error');
      this.isRedisAvailable = false;
      
      // Properly clean up failed connection attempt
      if (this.redisClient) {
        try {
          await this.redisClient.disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors for failed connections
        }
        this.redisClient = null;
      }
    }
  }

  private getKey(identifier: string): string {
    return `${this.config.keyPrefix}${identifier}`;
  }

  private cleanupInMemoryStorage(): void {
    const now = Date.now();
    Array.from(this.fallbackStorage.entries()).forEach(([key, data]) => {
      if (now > data.resetTime) {
        this.fallbackStorage.delete(key);
      }
    });
  }

  private async handleRedisRateLimit(identifier: string): Promise<RateLimitResult> {
    if (!this.redisClient || !this.isRedisAvailable) {
      throw new Error('Redis not available');
    }

    const key = this.getKey(identifier);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    try {
      // Use Redis sorted set to store timestamps
      const multi = this.redisClient.multi();
      
      // Remove old entries outside the window
      multi.zRemRangeByScore(key, 0, windowStart);
      
      // Add current timestamp
      multi.zAdd(key, { score: now, value: now.toString() });
      
      // Count current requests in window
      multi.zCard(key);
      
      // Set expiration for cleanup
      multi.expire(key, Math.ceil(this.config.windowMs / 1000) + 60);
      
      const results = await multi.exec();
      
      if (!results) {
        throw new Error('Redis transaction failed');
      }

      const count = Number(results[2]) || 0;
      const resetTime = now + this.config.windowMs;
      const allowed = count <= this.config.max;
      const remainingAttempts = Math.max(0, this.config.max - count);

      return {
        allowed,
        count,
        resetTime,
        remainingAttempts
      };
    } catch (error) {
      console.warn('Redis rate limit operation failed:', error instanceof Error ? error.message : 'Unknown error');
      this.isRedisAvailable = false;
      throw error;
    }
  }

  private handleInMemoryRateLimit(identifier: string): RateLimitResult {
    const now = Date.now();
    
    // Clean up old entries periodically
    this.cleanupInMemoryStorage();
    
    const existing = this.fallbackStorage.get(identifier) || {
      count: 0,
      resetTime: now + this.config.windowMs
    };

    // Check if window has expired
    if (now > existing.resetTime) {
      existing.count = 0;
      existing.resetTime = now + this.config.windowMs;
    }

    // Increment counter
    existing.count += 1;
    this.fallbackStorage.set(identifier, existing);

    const allowed = existing.count <= this.config.max;
    const remainingAttempts = Math.max(0, this.config.max - existing.count);

    return {
      allowed,
      count: existing.count,
      resetTime: existing.resetTime,
      remainingAttempts
    };
  }

  public async checkRateLimit(identifier: string): Promise<RateLimitResult> {
    try {
      // Try Redis first if available
      if (this.isRedisAvailable && this.redisClient) {
        return await this.handleRedisRateLimit(identifier);
      }
    } catch (error) {
      console.warn('Falling back to in-memory rate limiting due to Redis error');
    }

    // Fallback to in-memory
    return this.handleInMemoryRateLimit(identifier);
  }

  public async reset(identifier?: string): Promise<void> {
    if (identifier) {
      // Reset specific identifier
      if (this.isRedisAvailable && this.redisClient) {
        try {
          await this.redisClient.del(this.getKey(identifier));
        } catch (error) {
          console.warn('Redis reset failed:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
      this.fallbackStorage.delete(identifier);
    } else {
      // Reset all
      if (this.isRedisAvailable && this.redisClient) {
        try {
          const keys = await this.redisClient.keys(`${this.config.keyPrefix}*`);
          if (keys.length > 0) {
            await this.redisClient.del(keys);
          }
        } catch (error) {
          console.warn('Redis reset all failed:', error instanceof Error ? error.message : 'Unknown error');
        }
      }
      this.fallbackStorage.clear();
    }
  }

  public getStatus(): { redis: boolean; inMemoryCount: number } {
    return {
      redis: this.isRedisAvailable,
      inMemoryCount: this.fallbackStorage.size
    };
  }

  public async close(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        console.warn('Error closing Redis connection:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }
}

// Create singleton instance for student login rate limiting
export const studentLoginRateLimit = new DistributedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP per window
  keyPrefix: 'student_login:' // Single prefix - no double prefixing
});

// Helper function to create rate limit middleware
export function createRateLimitMiddleware(rateLimiter: DistributedRateLimit, options?: {
  message?: object;
  keyGenerator?: (req: any) => string;
}) {
  const defaultMessage = { message: "Too many attempts, please try again later" };
  const defaultKeyGenerator = (req: any) => req.ip || req.connection?.remoteAddress || 'unknown';
  
  const message = options?.message || defaultMessage;
  const keyGenerator = options?.keyGenerator || defaultKeyGenerator;

  return async (req: any, res: any, next: any) => {
    try {
      const identifier = keyGenerator(req);
      const result = await rateLimiter.checkRateLimit(identifier);

      // Add standard rate limit headers (production-ready)
      const retryAfterSeconds = Math.ceil((result.resetTime - Date.now()) / 1000);
      res.set({
        'X-RateLimit-Limit': rateLimiter['config'].max.toString(),
        'X-RateLimit-Remaining': result.remainingAttempts.toString(),
        'X-RateLimit-Reset': Math.floor(result.resetTime / 1000).toString(), // Unix timestamp
        'X-RateLimit-Used': result.count.toString(),
        'X-RateLimit-Window': Math.floor(rateLimiter['config'].windowMs / 1000).toString()
      });

      if (!result.allowed) {
        // Add Retry-After header for 429 responses (HTTP standard)
        res.set('Retry-After', retryAfterSeconds.toString());
        
        return res.status(429).json({
          ...message,
          retryAfter: retryAfterSeconds,
          retryAfterMs: result.resetTime - Date.now()
        });
      }

      next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // If rate limiting fails, allow the request but log the error
      next();
    }
  };
}