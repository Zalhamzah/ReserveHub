"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.realTimeAvailabilityService = exports.RealTimeAvailabilityService = void 0;
const availabilityService_1 = require("./availabilityService");
const websocket_1 = require("@/utils/websocket");
const redis_1 = require("@/utils/redis");
const logger_1 = require("@/utils/logger");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
class RealTimeAvailabilityService {
    static instance;
    updateBuffer = new Map();
    bufferTimeout = null;
    BUFFER_DELAY_MS = 500; // 500ms delay to batch updates
    static getInstance() {
        if (!RealTimeAvailabilityService.instance) {
            RealTimeAvailabilityService.instance = new RealTimeAvailabilityService();
        }
        return RealTimeAvailabilityService.instance;
    }
    /**
     * Notify availability change when booking is created
     */
    async notifyBookingCreated(businessId, locationId, bookingDateTime, partySize, duration) {
        try {
            const date = (0, moment_timezone_1.default)(bookingDateTime).format('YYYY-MM-DD');
            // Get updated availability for the affected date
            const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
            // Prepare availability update
            const update = {
                businessId,
                locationId,
                date,
                updatedSlots,
                updateType: 'BOOKING_CREATED',
                timestamp: new Date().toISOString()
            };
            // Buffer the update to avoid spam
            await this.bufferUpdate(update);
            // Emit to WebSocket subscribers
            websocket_1.websocketEvents.availabilityUpdated(businessId, update);
            logger_1.logger.info(`Availability updated for booking creation: ${businessId} - ${date}`);
        }
        catch (error) {
            logger_1.logger.error('Error notifying booking creation:', error);
        }
    }
    /**
     * Notify availability change when booking is cancelled
     */
    async notifyBookingCancelled(businessId, locationId, bookingDateTime, partySize, duration) {
        try {
            const date = (0, moment_timezone_1.default)(bookingDateTime).format('YYYY-MM-DD');
            // Get updated availability for the affected date
            const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
            // Prepare availability update
            const update = {
                businessId,
                locationId,
                date,
                updatedSlots,
                updateType: 'BOOKING_CANCELLED',
                timestamp: new Date().toISOString()
            };
            // Buffer the update
            await this.bufferUpdate(update);
            // Emit to WebSocket subscribers
            websocket_1.websocketEvents.availabilityUpdated(businessId, update);
            logger_1.logger.info(`Availability updated for booking cancellation: ${businessId} - ${date}`);
        }
        catch (error) {
            logger_1.logger.error('Error notifying booking cancellation:', error);
        }
    }
    /**
     * Notify availability change when booking is updated
     */
    async notifyBookingUpdated(businessId, locationId, oldBookingDateTime, newBookingDateTime, partySize, duration) {
        try {
            const oldDate = (0, moment_timezone_1.default)(oldBookingDateTime).format('YYYY-MM-DD');
            const newDate = (0, moment_timezone_1.default)(newBookingDateTime).format('YYYY-MM-DD');
            // Get unique dates that need updates
            const datesToUpdate = Array.from(new Set([oldDate, newDate]));
            for (const date of datesToUpdate) {
                const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
                const update = {
                    businessId,
                    locationId,
                    date,
                    updatedSlots,
                    updateType: 'BOOKING_UPDATED',
                    timestamp: new Date().toISOString()
                };
                await this.bufferUpdate(update);
                websocket_1.websocketEvents.availabilityUpdated(businessId, update);
            }
            logger_1.logger.info(`Availability updated for booking update: ${businessId} - ${datesToUpdate.join(', ')}`);
        }
        catch (error) {
            logger_1.logger.error('Error notifying booking update:', error);
        }
    }
    /**
     * Notify availability change when table status changes
     */
    async notifyTableStatusChanged(businessId, locationId, tableId, newStatus) {
        try {
            const today = (0, moment_timezone_1.default)().format('YYYY-MM-DD');
            const tomorrow = (0, moment_timezone_1.default)().add(1, 'day').format('YYYY-MM-DD');
            // Update availability for today and tomorrow
            const datesToUpdate = [today, tomorrow];
            for (const date of datesToUpdate) {
                const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
                const update = {
                    businessId,
                    locationId,
                    date,
                    updatedSlots,
                    updateType: 'TABLE_STATUS_CHANGED',
                    timestamp: new Date().toISOString()
                };
                await this.bufferUpdate(update);
                websocket_1.websocketEvents.availabilityUpdated(businessId, update);
            }
            logger_1.logger.info(`Availability updated for table status change: ${businessId} - ${tableId} - ${newStatus}`);
        }
        catch (error) {
            logger_1.logger.error('Error notifying table status change:', error);
        }
    }
    /**
     * Get cached availability or fetch fresh data
     */
    async getCachedAvailability(businessId, locationId, date, partySize, duration) {
        try {
            const cacheKey = `availability:${businessId}:${locationId || 'all'}:${date}:${partySize}:${duration || 90}`;
            // Try to get from cache first
            const cached = await redis_1.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
            // If not in cache, fetch fresh data
            const request = {
                businessId,
                locationId,
                date,
                partySize,
                duration
            };
            const slots = await availabilityService_1.availabilityService.getAvailableSlots(request);
            // Cache for 5 minutes
            await redis_1.redis.setex(cacheKey, 300, JSON.stringify(slots));
            return slots;
        }
        catch (error) {
            logger_1.logger.error('Error getting cached availability:', error);
            return [];
        }
    }
    /**
     * Clear cached availability for a specific date
     */
    async clearAvailabilityCache(businessId, locationId, date) {
        try {
            const pattern = `availability:${businessId}:${locationId || 'all'}:${date}:*`;
            // Get all keys matching the pattern
            const keys = await redis_1.redis.keys(pattern);
            if (keys.length > 0) {
                await redis_1.redis.del(...keys);
                logger_1.logger.debug(`Cleared ${keys.length} availability cache entries for ${businessId} - ${date}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error clearing availability cache:', error);
        }
    }
    /**
     * Subscribe to availability updates for a specific business and date
     */
    async subscribeToAvailabilityUpdates(businessId, locationId, date, socketId) {
        try {
            const subscriptionKey = `availability_subscription:${businessId}:${locationId || 'all'}:${date}`;
            // Add socket to subscription list
            await redis_1.redis.sadd(subscriptionKey, socketId);
            // Set expiration for the subscription (24 hours)
            await redis_1.redis.expire(subscriptionKey, 86400);
            logger_1.logger.debug(`Socket ${socketId} subscribed to availability updates: ${businessId} - ${date}`);
        }
        catch (error) {
            logger_1.logger.error('Error subscribing to availability updates:', error);
        }
    }
    /**
     * Unsubscribe from availability updates
     */
    async unsubscribeFromAvailabilityUpdates(businessId, locationId, date, socketId) {
        try {
            const subscriptionKey = `availability_subscription:${businessId}:${locationId || 'all'}:${date}`;
            // Remove socket from subscription list
            await redis_1.redis.srem(subscriptionKey, socketId);
            logger_1.logger.debug(`Socket ${socketId} unsubscribed from availability updates: ${businessId} - ${date}`);
        }
        catch (error) {
            logger_1.logger.error('Error unsubscribing from availability updates:', error);
        }
    }
    /**
     * Get updated availability for a specific date
     */
    async getUpdatedAvailability(businessId, locationId, date) {
        try {
            // Clear cache first to ensure fresh data
            await this.clearAvailabilityCache(businessId, locationId, date);
            // Get fresh availability data for common party sizes
            const partySizes = [1, 2, 4, 6, 8];
            const allSlots = [];
            for (const partySize of partySizes) {
                const request = {
                    businessId,
                    locationId,
                    date,
                    partySize
                };
                const slots = await availabilityService_1.availabilityService.getAvailableSlots(request);
                // Only add unique slots (by time)
                for (const slot of slots) {
                    const existingSlot = allSlots.find(s => s.time === slot.time);
                    if (!existingSlot) {
                        allSlots.push(slot);
                    }
                    else {
                        // Update existing slot with more restrictive availability
                        existingSlot.available = existingSlot.available && slot.available;
                    }
                }
            }
            // Sort by time
            allSlots.sort((a, b) => a.time.localeCompare(b.time));
            return allSlots;
        }
        catch (error) {
            logger_1.logger.error('Error getting updated availability:', error);
            return [];
        }
    }
    /**
     * Buffer updates to avoid spam
     */
    async bufferUpdate(update) {
        const key = `${update.businessId}:${update.locationId || 'all'}:${update.date}`;
        // Store the latest update for this key
        this.updateBuffer.set(key, update);
        // Clear existing timeout
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }
        // Set new timeout to process buffered updates
        this.bufferTimeout = setTimeout(() => {
            this.processBufferedUpdates();
        }, this.BUFFER_DELAY_MS);
    }
    /**
     * Process all buffered updates
     */
    async processBufferedUpdates() {
        try {
            const updates = Array.from(this.updateBuffer.values());
            this.updateBuffer.clear();
            for (const update of updates) {
                // Get subscribers for this update
                const subscriptionKey = `availability_subscription:${update.businessId}:${update.locationId || 'all'}:${update.date}`;
                const subscribers = await redis_1.redis.smembers(subscriptionKey);
                // Emit to each subscriber
                for (const socketId of subscribers) {
                    websocket_1.websocketEvents.availabilityUpdated(update.businessId, update);
                }
            }
            logger_1.logger.debug(`Processed ${updates.length} buffered availability updates`);
        }
        catch (error) {
            logger_1.logger.error('Error processing buffered updates:', error);
        }
    }
    /**
     * Start periodic availability refresh for active subscriptions
     */
    startPeriodicRefresh() {
        setInterval(async () => {
            try {
                // Get all active subscription keys
                const pattern = 'availability_subscription:*';
                const keys = await redis_1.redis.keys(pattern);
                for (const key of keys) {
                    const parts = key.split(':');
                    if (parts.length >= 4) {
                        const businessId = parts[2];
                        const locationId = parts[3] === 'all' ? undefined : parts[3];
                        const date = parts[4];
                        // Check if subscription is still active
                        const subscriberCount = await redis_1.redis.scard(key);
                        if (subscriberCount > 0) {
                            // Refresh availability for this key
                            await this.getUpdatedAvailability(businessId, locationId, date);
                        }
                    }
                }
            }
            catch (error) {
                logger_1.logger.error('Error in periodic availability refresh:', error);
            }
        }, 60000); // Refresh every minute
    }
}
exports.RealTimeAvailabilityService = RealTimeAvailabilityService;
exports.realTimeAvailabilityService = RealTimeAvailabilityService.getInstance();
//# sourceMappingURL=realTimeAvailabilityService.js.map