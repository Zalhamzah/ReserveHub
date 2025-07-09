import Redis from 'ioredis';
declare const redis: Redis;
export declare const redisHealthCheck: () => Promise<boolean>;
export declare const cache: {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds?: number): Promise<boolean>;
    del(key: string): Promise<boolean>;
    exists(key: string): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<boolean>;
    mget<T>(keys: string[]): Promise<(T | null)[]>;
    mset(keyValuePairs: Record<string, any>, ttlSeconds?: number): Promise<boolean>;
};
export declare const session: {
    create(userId: string, sessionData: any, ttlSeconds?: number): Promise<string>;
    get(sessionId: string): Promise<any | null>;
    update(sessionId: string, sessionData: any, ttlSeconds?: number): Promise<boolean>;
    destroy(sessionId: string): Promise<boolean>;
    getUserSessions(userId: string): Promise<string[]>;
    clearUserSessions(userId: string): Promise<boolean>;
};
export declare const rateLimiter: {
    check(key: string, limit: number, windowSeconds: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetTime: number;
    }>;
    reset(key: string): Promise<boolean>;
};
export declare const pubsub: {
    publish(channel: string, message: any): Promise<boolean>;
    subscribe(channel: string, callback: (message: any) => void): Redis;
};
export { redis };
//# sourceMappingURL=redis.d.ts.map