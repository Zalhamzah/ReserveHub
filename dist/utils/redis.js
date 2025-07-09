"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = exports.pubsub = exports.rateLimiter = exports.session = exports.cache = exports.redisHealthCheck = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("@/config/config");
const logger_1 = require("@/utils/logger");
// Create Redis client
const redisOptions = {
    retryDelayOnFailover: 100,
    retryTimes: 3,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    connectTimeout: 10000,
    commandTimeout: 5000
};
if (config_1.config.redis.password) {
    redisOptions.password = config_1.config.redis.password;
}
const redis = new ioredis_1.default(config_1.config.redis.url, redisOptions);
exports.redis = redis;
// Event handlers
redis.on('connect', () => {
    logger_1.logger.info('Redis connection established');
});
redis.on('ready', () => {
    logger_1.logger.info('Redis client ready');
});
redis.on('error', (error) => {
    logger_1.logger.error('Redis connection error:', error);
});
redis.on('close', () => {
    logger_1.logger.info('Redis connection closed');
});
redis.on('reconnecting', () => {
    logger_1.logger.info('Redis reconnecting...');
});
// Health check
const redisHealthCheck = async () => {
    try {
        await redis.ping();
        return true;
    }
    catch (error) {
        logger_1.logger.error('Redis health check failed:', error);
        return false;
    }
};
exports.redisHealthCheck = redisHealthCheck;
// Cache helpers
exports.cache = {
    // Get value from cache
    async get(key) {
        try {
            const value = await redis.get(key);
            return value ? JSON.parse(value) : null;
        }
        catch (error) {
            logger_1.logger.error('Redis get error:', error);
            return null;
        }
    },
    // Set value in cache with TTL
    async set(key, value, ttlSeconds = 3600) {
        try {
            await redis.setex(key, ttlSeconds, JSON.stringify(value));
            return true;
        }
        catch (error) {
            logger_1.logger.error('Redis set error:', error);
            return false;
        }
    },
    // Delete key from cache
    async del(key) {
        try {
            await redis.del(key);
            return true;
        }
        catch (error) {
            logger_1.logger.error('Redis delete error:', error);
            return false;
        }
    },
    // Check if key exists
    async exists(key) {
        try {
            const result = await redis.exists(key);
            return result === 1;
        }
        catch (error) {
            logger_1.logger.error('Redis exists error:', error);
            return false;
        }
    },
    // Set TTL for existing key
    async expire(key, ttlSeconds) {
        try {
            await redis.expire(key, ttlSeconds);
            return true;
        }
        catch (error) {
            logger_1.logger.error('Redis expire error:', error);
            return false;
        }
    },
    // Get multiple keys
    async mget(keys) {
        try {
            const values = await redis.mget(keys);
            return values.map(value => value ? JSON.parse(value) : null);
        }
        catch (error) {
            logger_1.logger.error('Redis mget error:', error);
            return keys.map(() => null);
        }
    },
    // Set multiple keys
    async mset(keyValuePairs, ttlSeconds) {
        try {
            const pipeline = redis.pipeline();
            Object.entries(keyValuePairs).forEach(([key, value]) => {
                if (ttlSeconds) {
                    pipeline.setex(key, ttlSeconds, JSON.stringify(value));
                }
                else {
                    pipeline.set(key, JSON.stringify(value));
                }
            });
            await pipeline.exec();
            return true;
        }
        catch (error) {
            logger_1.logger.error('Redis mset error:', error);
            return false;
        }
    }
};
// Session management
exports.session = {
    // Store user session
    async create(userId, sessionData, ttlSeconds = 86400) {
        const sessionId = `session:${userId}:${Date.now()}`;
        await exports.cache.set(sessionId, sessionData, ttlSeconds);
        return sessionId;
    },
    // Get session data
    async get(sessionId) {
        return await exports.cache.get(sessionId);
    },
    // Update session
    async update(sessionId, sessionData, ttlSeconds = 86400) {
        return await exports.cache.set(sessionId, sessionData, ttlSeconds);
    },
    // Delete session
    async destroy(sessionId) {
        return await exports.cache.del(sessionId);
    },
    // Get all sessions for user
    async getUserSessions(userId) {
        try {
            const pattern = `session:${userId}:*`;
            return await redis.keys(pattern);
        }
        catch (error) {
            logger_1.logger.error('Redis get user sessions error:', error);
            return [];
        }
    },
    // Clear all sessions for user
    async clearUserSessions(userId) {
        try {
            const sessions = await this.getUserSessions(userId);
            if (sessions.length > 0) {
                await redis.del(...sessions);
            }
            return true;
        }
        catch (error) {
            logger_1.logger.error('Redis clear user sessions error:', error);
            return false;
        }
    }
};
// Rate limiting
exports.rateLimiter = {
    // Check and increment rate limit
    async check(key, limit, windowSeconds) {
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
        }
        catch (error) {
            logger_1.logger.error('Redis rate limiter error:', error);
            return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
        }
    },
    // Reset rate limit for key
    async reset(key) {
        return await exports.cache.del(key);
    }
};
// Pub/Sub for real-time features
exports.pubsub = {
    // Publish message
    async publish(channel, message) {
        try {
            await redis.publish(channel, JSON.stringify(message));
            return true;
        }
        catch (error) {
            logger_1.logger.error('Redis publish error:', error);
            return false;
        }
    },
    // Subscribe to channel
    subscribe(channel, callback) {
        const subscriberOptions = {};
        if (config_1.config.redis.password) {
            subscriberOptions.password = config_1.config.redis.password;
        }
        const subscriber = new ioredis_1.default(config_1.config.redis.url, subscriberOptions);
        subscriber.subscribe(channel);
        subscriber.on('message', (receivedChannel, message) => {
            if (receivedChannel === channel) {
                try {
                    callback(JSON.parse(message));
                }
                catch (error) {
                    logger_1.logger.error('Redis subscribe callback error:', error);
                }
            }
        });
        return subscriber;
    }
};
//# sourceMappingURL=redis.js.map