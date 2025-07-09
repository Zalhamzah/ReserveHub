import Redis from 'ioredis';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';

// Create Redis client
const redisOptions: any = {
  retryDelayOnFailover: 100,
  retryTimes: 3,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000
};

if (config.redis.password) {
  redisOptions.password = config.redis.password;
}

const redis = new Redis(config.redis.url, redisOptions);

// Event handlers
redis.on('connect', () => {
  logger.info('Redis connection established');
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

redis.on('close', () => {
  logger.info('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

// Health check
export const redisHealthCheck = async (): Promise<boolean> => {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

// Cache helpers
export const cache = {
  // Get value from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  // Set value in cache with TTL
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<boolean> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Redis set error:', error);
      return false;
    }
  },

  // Delete key from cache
  async del(key: string): Promise<boolean> {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error('Redis delete error:', error);
      return false;
    }
  },

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  },

  // Set TTL for existing key
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      await redis.expire(key, ttlSeconds);
      return true;
    } catch (error) {
      logger.error('Redis expire error:', error);
      return false;
    }
  },

  // Get multiple keys
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await redis.mget(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Redis mget error:', error);
      return keys.map(() => null);
    }
  },

  // Set multiple keys
  async mset(keyValuePairs: Record<string, any>, ttlSeconds?: number): Promise<boolean> {
    try {
      const pipeline = redis.pipeline();
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        if (ttlSeconds) {
          pipeline.setex(key, ttlSeconds, JSON.stringify(value));
        } else {
          pipeline.set(key, JSON.stringify(value));
        }
      });
      
      await pipeline.exec();
      return true;
    } catch (error) {
      logger.error('Redis mset error:', error);
      return false;
    }
  }
};

// Session management
export const session = {
  // Store user session
  async create(userId: string, sessionData: any, ttlSeconds: number = 86400): Promise<string> {
    const sessionId = `session:${userId}:${Date.now()}`;
    await cache.set(sessionId, sessionData, ttlSeconds);
    return sessionId;
  },

  // Get session data
  async get(sessionId: string): Promise<any | null> {
    return await cache.get(sessionId);
  },

  // Update session
  async update(sessionId: string, sessionData: any, ttlSeconds: number = 86400): Promise<boolean> {
    return await cache.set(sessionId, sessionData, ttlSeconds);
  },

  // Delete session
  async destroy(sessionId: string): Promise<boolean> {
    return await cache.del(sessionId);
  },

  // Get all sessions for user
  async getUserSessions(userId: string): Promise<string[]> {
    try {
      const pattern = `session:${userId}:*`;
      return await redis.keys(pattern);
    } catch (error) {
      logger.error('Redis get user sessions error:', error);
      return [];
    }
  },

  // Clear all sessions for user
  async clearUserSessions(userId: string): Promise<boolean> {
    try {
      const sessions = await this.getUserSessions(userId);
      if (sessions.length > 0) {
        await redis.del(...sessions);
      }
      return true;
    } catch (error) {
      logger.error('Redis clear user sessions error:', error);
      return false;
    }
  }
};

// Rate limiting
export const rateLimiter = {
  // Check and increment rate limit
  async check(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      
      const ttl = await redis.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);
      
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime
      };
    } catch (error) {
      logger.error('Redis rate limiter error:', error);
      return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  },

  // Reset rate limit for key
  async reset(key: string): Promise<boolean> {
    return await cache.del(key);
  }
};

// Pub/Sub for real-time features
export const pubsub = {
  // Publish message
  async publish(channel: string, message: any): Promise<boolean> {
    try {
      await redis.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error('Redis publish error:', error);
      return false;
    }
  },

  // Subscribe to channel
  subscribe(channel: string, callback: (message: any) => void): Redis {
    const subscriberOptions: any = {};
    if (config.redis.password) {
      subscriberOptions.password = config.redis.password;
    }
    
    const subscriber = new Redis(config.redis.url, subscriberOptions);
    
    subscriber.subscribe(channel);
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          callback(JSON.parse(message));
        } catch (error) {
          logger.error('Redis subscribe callback error:', error);
        }
      }
    });
    
    return subscriber;
  }
};

export { redis }; 