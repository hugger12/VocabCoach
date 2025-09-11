// Redis configuration for distributed rate limiting (node-redis v5 format)
export interface RedisConfig {
  url?: string;
  socket?: {
    host?: string;
    port?: number;
    connectTimeout?: number;
    reconnectStrategy?: (retries: number) => number | Error;
  };
  password?: string;
  database?: number;
}

export function getRedisConfig(): RedisConfig {
  // Check for various Redis URL environment variables
  const redisUrl = 
    process.env.REDIS_URL ||           // Standard Redis URL
    process.env.UPSTASH_REDIS_URL ||   // Upstash Redis (common for serverless)
    process.env.REDISCLOUD_URL ||      // Redis Cloud
    process.env.REDISTOGO_URL ||       // Redis To Go
    process.env.REDISLAB_URL;          // Redis Labs

  // If we have a URL, use it directly (preferred for production)
  if (redisUrl) {
    return {
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries: number) => {
          // Exponential backoff with max 3 attempts, then give up
          if (retries >= 3) {
            return new Error('Max Redis reconnection attempts reached');
          }
          return Math.min(retries * 50, 3000);
        }
      }
    };
  }

  // Otherwise, build from individual environment variables
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const database = parseInt(process.env.REDIS_DB || '0', 10);

  return {
    socket: {
      host,
      port,
      connectTimeout: 5000,
      reconnectStrategy: (retries: number) => {
        // Exponential backoff with max 3 attempts, then give up
        if (retries >= 3) {
          return new Error('Max Redis reconnection attempts reached');
        }
        return Math.min(retries * 50, 3000);
      }
    },
    password,
    database
  };
}

// Default development configuration (can be overridden by environment variables)
export const DEFAULT_REDIS_CONFIG: RedisConfig = {
  socket: {
    host: 'localhost',
    port: 6379,
    connectTimeout: 5000,
    reconnectStrategy: (retries: number) => {
      if (retries >= 3) {
        return new Error('Max Redis reconnection attempts reached');
      }
      return Math.min(retries * 50, 3000);
    }
  },
  database: 0
};

// Function to check if Redis is likely to be available
export function isRedisConfigured(): boolean {
  return !!(
    process.env.REDIS_URL ||
    process.env.UPSTASH_REDIS_URL ||
    process.env.REDISCLOUD_URL ||
    process.env.REDISTOGO_URL ||
    process.env.REDISLAB_URL ||
    process.env.REDIS_HOST
  );
}

// Log configuration for debugging
export function logRedisConfig(): void {
  const hasUrl = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL);
  const hasHost = !!process.env.REDIS_HOST;
  const configured = isRedisConfigured();
  
  console.log('Redis Configuration:');
  console.log(`  - Configured: ${configured}`);
  console.log(`  - Has URL: ${hasUrl}`);
  console.log(`  - Has Host: ${hasHost}`);
  console.log(`  - Will attempt connection: ${configured}`);
  console.log(`  - Fallback to in-memory: ${!configured}`);
}