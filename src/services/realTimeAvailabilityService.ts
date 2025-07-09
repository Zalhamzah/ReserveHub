import { availabilityService, AvailabilityRequest, AvailabilitySlot } from './availabilityService';
import { websocketEvents } from '@/utils/websocket';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';
import moment from 'moment-timezone';

export interface AvailabilityUpdate {
  businessId: string;
  locationId?: string | undefined;
  date: string;
  updatedSlots: AvailabilitySlot[];
  updateType: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_UPDATED' | 'TABLE_STATUS_CHANGED';
  timestamp: string;
}

export class RealTimeAvailabilityService {
  private static instance: RealTimeAvailabilityService;
  private updateBuffer: Map<string, AvailabilityUpdate> = new Map();
  private bufferTimeout: NodeJS.Timeout | null = null;
  private readonly BUFFER_DELAY_MS = 500; // 500ms delay to batch updates

  public static getInstance(): RealTimeAvailabilityService {
    if (!RealTimeAvailabilityService.instance) {
      RealTimeAvailabilityService.instance = new RealTimeAvailabilityService();
    }
    return RealTimeAvailabilityService.instance;
  }

  /**
   * Notify availability change when booking is created
   */
  async notifyBookingCreated(
    businessId: string,
    locationId: string | undefined,
    bookingDateTime: string,
    partySize: number,
    duration: number
  ): Promise<void> {
    try {
      const date = moment(bookingDateTime).format('YYYY-MM-DD');
      
      // Get updated availability for the affected date
      const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
      
      // Prepare availability update
      const update: AvailabilityUpdate = {
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
      websocketEvents.availabilityUpdated(businessId, update);

      logger.info(`Availability updated for booking creation: ${businessId} - ${date}`);

    } catch (error) {
      logger.error('Error notifying booking creation:', error);
    }
  }

  /**
   * Notify availability change when booking is cancelled
   */
  async notifyBookingCancelled(
    businessId: string,
    locationId: string | undefined,
    bookingDateTime: string,
    partySize: number,
    duration: number
  ): Promise<void> {
    try {
      const date = moment(bookingDateTime).format('YYYY-MM-DD');
      
      // Get updated availability for the affected date
      const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
      
      // Prepare availability update
      const update: AvailabilityUpdate = {
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
      websocketEvents.availabilityUpdated(businessId, update);

      logger.info(`Availability updated for booking cancellation: ${businessId} - ${date}`);

    } catch (error) {
      logger.error('Error notifying booking cancellation:', error);
    }
  }

  /**
   * Notify availability change when booking is updated
   */
  async notifyBookingUpdated(
    businessId: string,
    locationId: string | undefined,
    oldBookingDateTime: string,
    newBookingDateTime: string,
    partySize: number,
    duration: number
  ): Promise<void> {
    try {
      const oldDate = moment(oldBookingDateTime).format('YYYY-MM-DD');
      const newDate = moment(newBookingDateTime).format('YYYY-MM-DD');
      
      // Get unique dates that need updates
      const datesToUpdate = Array.from(new Set([oldDate, newDate]));
      
      for (const date of datesToUpdate) {
        const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
        
        const update: AvailabilityUpdate = {
          businessId,
          locationId,
          date,
          updatedSlots,
          updateType: 'BOOKING_UPDATED',
          timestamp: new Date().toISOString()
        };

        await this.bufferUpdate(update);
        websocketEvents.availabilityUpdated(businessId, update);
      }

      logger.info(`Availability updated for booking update: ${businessId} - ${datesToUpdate.join(', ')}`);

    } catch (error) {
      logger.error('Error notifying booking update:', error);
    }
  }

  /**
   * Notify availability change when table status changes
   */
  async notifyTableStatusChanged(
    businessId: string,
    locationId: string | undefined,
    tableId: string,
    newStatus: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE'
  ): Promise<void> {
    try {
      const today = moment().format('YYYY-MM-DD');
      const tomorrow = moment().add(1, 'day').format('YYYY-MM-DD');
      
      // Update availability for today and tomorrow
      const datesToUpdate = [today, tomorrow];
      
      for (const date of datesToUpdate) {
        const updatedSlots = await this.getUpdatedAvailability(businessId, locationId, date);
        
        const update: AvailabilityUpdate = {
          businessId,
          locationId,
          date,
          updatedSlots,
          updateType: 'TABLE_STATUS_CHANGED',
          timestamp: new Date().toISOString()
        };

        await this.bufferUpdate(update);
        websocketEvents.availabilityUpdated(businessId, update);
      }

      logger.info(`Availability updated for table status change: ${businessId} - ${tableId} - ${newStatus}`);

    } catch (error) {
      logger.error('Error notifying table status change:', error);
    }
  }

  /**
   * Get cached availability or fetch fresh data
   */
  async getCachedAvailability(
    businessId: string,
    locationId: string | undefined,
    date: string,
    partySize: number,
    duration?: number
  ): Promise<AvailabilitySlot[]> {
    try {
      const cacheKey = `availability:${businessId}:${locationId || 'all'}:${date}:${partySize}:${duration || 90}`;
      
      // Try to get from cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AvailabilitySlot[];
      }

      // If not in cache, fetch fresh data
      const request: AvailabilityRequest = {
        businessId,
        locationId,
        date,
        partySize,
        duration
      };

      const slots = await availabilityService.getAvailableSlots(request);
      
      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(slots));
      
      return slots;

    } catch (error) {
      logger.error('Error getting cached availability:', error);
      return [];
    }
  }

  /**
   * Clear cached availability for a specific date
   */
  async clearAvailabilityCache(businessId: string, locationId: string | undefined, date: string): Promise<void> {
    try {
      const pattern = `availability:${businessId}:${locationId || 'all'}:${date}:*`;
      
      // Get all keys matching the pattern
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.debug(`Cleared ${keys.length} availability cache entries for ${businessId} - ${date}`);
      }

    } catch (error) {
      logger.error('Error clearing availability cache:', error);
    }
  }

  /**
   * Subscribe to availability updates for a specific business and date
   */
  async subscribeToAvailabilityUpdates(
    businessId: string,
    locationId: string | undefined,
    date: string,
    socketId: string
  ): Promise<void> {
    try {
      const subscriptionKey = `availability_subscription:${businessId}:${locationId || 'all'}:${date}`;
      
      // Add socket to subscription list
      await redis.sadd(subscriptionKey, socketId);
      
      // Set expiration for the subscription (24 hours)
      await redis.expire(subscriptionKey, 86400);
      
      logger.debug(`Socket ${socketId} subscribed to availability updates: ${businessId} - ${date}`);

    } catch (error) {
      logger.error('Error subscribing to availability updates:', error);
    }
  }

  /**
   * Unsubscribe from availability updates
   */
  async unsubscribeFromAvailabilityUpdates(
    businessId: string,
    locationId: string | undefined,
    date: string,
    socketId: string
  ): Promise<void> {
    try {
      const subscriptionKey = `availability_subscription:${businessId}:${locationId || 'all'}:${date}`;
      
      // Remove socket from subscription list
      await redis.srem(subscriptionKey, socketId);
      
      logger.debug(`Socket ${socketId} unsubscribed from availability updates: ${businessId} - ${date}`);

    } catch (error) {
      logger.error('Error unsubscribing from availability updates:', error);
    }
  }

  /**
   * Get updated availability for a specific date
   */
  private async getUpdatedAvailability(
    businessId: string,
    locationId: string | undefined,
    date: string
  ): Promise<AvailabilitySlot[]> {
    try {
      // Clear cache first to ensure fresh data
      await this.clearAvailabilityCache(businessId, locationId, date);
      
      // Get fresh availability data for common party sizes
      const partySizes = [1, 2, 4, 6, 8];
      const allSlots: AvailabilitySlot[] = [];
      
      for (const partySize of partySizes) {
        const request: AvailabilityRequest = {
          businessId,
          locationId,
          date,
          partySize
        };

        const slots = await availabilityService.getAvailableSlots(request);
        
        // Only add unique slots (by time)
        for (const slot of slots) {
          const existingSlot = allSlots.find(s => s.time === slot.time);
          if (!existingSlot) {
            allSlots.push(slot);
          } else {
            // Update existing slot with more restrictive availability
            existingSlot.available = existingSlot.available && slot.available;
          }
        }
      }

      // Sort by time
      allSlots.sort((a, b) => a.time.localeCompare(b.time));
      
      return allSlots;

    } catch (error) {
      logger.error('Error getting updated availability:', error);
      return [];
    }
  }

  /**
   * Buffer updates to avoid spam
   */
  private async bufferUpdate(update: AvailabilityUpdate): Promise<void> {
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
  private async processBufferedUpdates(): Promise<void> {
    try {
      const updates = Array.from(this.updateBuffer.values());
      this.updateBuffer.clear();
      
      for (const update of updates) {
        // Get subscribers for this update
        const subscriptionKey = `availability_subscription:${update.businessId}:${update.locationId || 'all'}:${update.date}`;
        const subscribers = await redis.smembers(subscriptionKey);
        
        // Emit to each subscriber
        for (const socketId of subscribers) {
          websocketEvents.availabilityUpdated(update.businessId, update);
        }
      }
      
      logger.debug(`Processed ${updates.length} buffered availability updates`);

    } catch (error) {
      logger.error('Error processing buffered updates:', error);
    }
  }

  /**
   * Start periodic availability refresh for active subscriptions
   */
  startPeriodicRefresh(): void {
    setInterval(async () => {
      try {
        // Get all active subscription keys
        const pattern = 'availability_subscription:*';
        const keys = await redis.keys(pattern);
        
        for (const key of keys) {
          const parts = key.split(':');
          if (parts.length >= 4) {
            const businessId = parts[2];
            const locationId = parts[3] === 'all' ? undefined : parts[3];
            const date = parts[4];
            
            // Check if subscription is still active
            const subscriberCount = await redis.scard(key);
            if (subscriberCount > 0) {
              // Refresh availability for this key
              await this.getUpdatedAvailability(businessId, locationId, date);
            }
          }
        }
        
      } catch (error) {
        logger.error('Error in periodic availability refresh:', error);
      }
    }, 60000); // Refresh every minute
  }
}

export const realTimeAvailabilityService = RealTimeAvailabilityService.getInstance(); 