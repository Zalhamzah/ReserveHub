import { prisma } from '@/utils/database';
import { redis } from '@/utils/redis';
import { logger } from '@/utils/logger';
import { config } from '@/config/config';
import moment from 'moment-timezone';

export interface AvailabilitySlot {
  time: string;
  available: boolean;
  capacity: number;
  reserved: number;
  tables: {
    id: string;
    number: string;
    capacity: number;
    available: boolean;
  }[];
}

export interface AvailabilityRequest {
  businessId: string;
  locationId?: string;
  date: string;
  partySize: number;
  duration?: number;
}

export interface BookingConflict {
  conflictType: 'OVERBOOKING' | 'TABLE_UNAVAILABLE' | 'TIME_CONFLICT';
  message: string;
  suggestedTimes?: string[];
}

export class AvailabilityService {
  private static instance: AvailabilityService;
  private lockTimeoutMs = 30000; // 30 seconds
  private slotIntervalMinutes = 15; // 15-minute intervals

  public static getInstance(): AvailabilityService {
    if (!AvailabilityService.instance) {
      AvailabilityService.instance = new AvailabilityService();
    }
    return AvailabilityService.instance;
  }

  /**
   * Get available time slots for a specific date and party size
   */
  async getAvailableSlots(request: AvailabilityRequest): Promise<AvailabilitySlot[]> {
    try {
      const { businessId, locationId, date, partySize, duration = config.business.defaultBookingDuration } = request;
      
      // Validate date
      const targetDate = moment.tz(date, 'YYYY-MM-DD', 'UTC');
      if (!targetDate.isValid()) {
        throw new Error('Invalid date format');
      }

      // Get business timezone
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { timezone: true }
      });

      if (!business) {
        throw new Error('Business not found');
      }

      // Convert to business timezone
      const businessDate = targetDate.clone().tz(business.timezone);
      
      // Get operating hours for the location
      const operatingHours = await this.getOperatingHours(businessId, locationId, businessDate.day());
      
      if (!operatingHours.isOpen) {
        return [];
      }

      // Generate time slots
      const slots = this.generateTimeSlots(businessDate, operatingHours, duration);
      
      // Get table availability for each slot
      const availabilityPromises = slots.map(slot => 
        this.checkSlotAvailability(businessId, locationId, slot, partySize, duration)
      );

      const availabilityResults = await Promise.all(availabilityPromises);
      
      return slots.map((slot, index) => {
        const result = availabilityResults[index];
        return {
          time: slot.format('HH:mm'),
          available: result?.available || false,
          capacity: result?.capacity || 0,
          reserved: result?.reserved || 0,
          tables: result?.tables || []
        };
      });

    } catch (error) {
      logger.error('Error getting available slots:', error);
      throw error;
    }
  }

  /**
   * Check if a specific time slot is available
   */
  async checkSlotAvailability(
    businessId: string,
    locationId: string | undefined,
    slotTime: moment.Moment,
    partySize: number,
    duration: number
  ): Promise<{
    available: boolean;
    capacity: number;
    reserved: number;
    tables: Array<{
      id: string;
      number: string;
      capacity: number;
      available: boolean;
    }>;
  }> {
    try {
      // Get tables for the location/business
      const tables = await this.getAvailableTables(businessId, locationId, slotTime, duration);
      
      // Filter tables that can accommodate party size
      const suitableTables = tables.filter(table => 
        table.capacity >= partySize && table.available
      );

      const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
      const availableCapacity = suitableTables.reduce((sum, table) => sum + table.capacity, 0);
      const reservedCapacity = totalCapacity - availableCapacity;

      return {
        available: suitableTables.length > 0,
        capacity: totalCapacity,
        reserved: reservedCapacity,
        tables: tables.map(table => ({
          id: table.id,
          number: table.number,
          capacity: table.capacity,
          available: table.available
        }))
      };

    } catch (error) {
      logger.error('Error checking slot availability:', error);
      throw error;
    }
  }

  /**
   * Reserve a time slot with conflict detection
   */
  async reserveSlot(
    businessId: string,
    locationId: string | undefined,
    dateTime: string,
    partySize: number,
    duration: number,
    customerId: string
  ): Promise<{ success: boolean; tableId?: string; conflicts?: BookingConflict[] }> {
    const lockKey = `booking_lock:${businessId}:${locationId}:${dateTime}`;
    
    try {
      // Acquire distributed lock
      const lockAcquired = await this.acquireLock(lockKey);
      if (!lockAcquired) {
        return {
          success: false,
          conflicts: [{
            conflictType: 'TIME_CONFLICT',
            message: 'Another booking is being processed for this time slot'
          }]
        };
      }

      // Parse and validate datetime
      const bookingTime = moment(dateTime);
      if (!bookingTime.isValid()) {
        throw new Error('Invalid booking time format');
      }

      // Check for conflicts
      const conflicts = await this.detectBookingConflicts(
        businessId,
        locationId,
        bookingTime,
        partySize,
        duration
      );

      if (conflicts.length > 0) {
        logger.warn(`Booking conflicts detected for ${bookingTime.format('YYYY-MM-DD HH:mm')}, partySize: ${partySize}`, conflicts);
        return { success: false, conflicts };
      }

      // Find best available table
      const tableId = await this.findBestTable(businessId, locationId, bookingTime, partySize, duration);
      
      if (!tableId) {
        logger.warn(`No suitable table found for ${bookingTime.format('YYYY-MM-DD HH:mm')}, partySize: ${partySize}`);
        return {
          success: false,
          conflicts: [{
            conflictType: 'TABLE_UNAVAILABLE',
            message: 'No suitable table available for the requested time'
          }]
        };
      }

      // Cache the reservation to prevent overbooking
      await this.cacheReservation(businessId, locationId, bookingTime, tableId, duration);

      return { success: true, tableId };

    } catch (error) {
      logger.error('Error reserving slot:', error);
      throw error;
    } finally {
      // Release lock
      await this.releaseLock(lockKey);
    }
  }

  /**
   * Release a reserved slot
   */
  async releaseSlot(
    businessId: string,
    locationId: string | undefined,
    dateTime: string,
    tableId: string,
    duration: number
  ): Promise<void> {
    try {
      const bookingTime = moment(dateTime);
      
      // Remove from cache
      await this.removeReservationFromCache(businessId, locationId, bookingTime, tableId, duration);
      
      logger.info(`Released slot: ${dateTime} for table ${tableId}`);

    } catch (error) {
      logger.error('Error releasing slot:', error);
      throw error;
    }
  }

  /**
   * Get operating hours for a specific day
   */
  private async getOperatingHours(businessId: string, locationId: string | undefined, dayOfWeek: number): Promise<{
    isOpen: boolean;
    openTime: string;
    closeTime: string;
  }> {
    try {
      // For now, return default operating hours since ShiftSchedule is for staff scheduling
      // In a real implementation, you'd have a separate BusinessHours model
      
      // Default restaurant hours based on day of week
      const defaultHours = {
        0: { isOpen: false, openTime: '', closeTime: '' }, // Sunday
        1: { isOpen: true, openTime: '11:00', closeTime: '22:00' }, // Monday
        2: { isOpen: true, openTime: '11:00', closeTime: '22:00' }, // Tuesday
        3: { isOpen: true, openTime: '11:00', closeTime: '22:00' }, // Wednesday
        4: { isOpen: true, openTime: '11:00', closeTime: '22:00' }, // Thursday
        5: { isOpen: true, openTime: '11:00', closeTime: '23:00' }, // Friday
        6: { isOpen: true, openTime: '10:00', closeTime: '23:00' }, // Saturday
      };

      return defaultHours[dayOfWeek as keyof typeof defaultHours] || { isOpen: false, openTime: '', closeTime: '' };

    } catch (error) {
      logger.error('Error getting operating hours:', error);
      return { isOpen: false, openTime: '', closeTime: '' };
    }
  }

  /**
   * Generate time slots for a given date and operating hours
   */
  private generateTimeSlots(
    date: moment.Moment,
    operatingHours: { openTime: string; closeTime: string },
    duration: number
  ): moment.Moment[] {
    const slots: moment.Moment[] = [];
    
    const openTime = moment(operatingHours.openTime, 'HH:mm');
    const closeTime = moment(operatingHours.closeTime, 'HH:mm');
    
    // Start from opening time
    let currentSlot = date.clone()
      .hour(openTime.hour())
      .minute(openTime.minute())
      .second(0)
      .millisecond(0);

    const endTime = date.clone()
      .hour(closeTime.hour())
      .minute(closeTime.minute())
      .subtract(duration, 'minutes'); // Last slot should allow for full duration

    while (currentSlot.isBefore(endTime) || currentSlot.isSame(endTime)) {
      slots.push(currentSlot.clone());
      currentSlot.add(this.slotIntervalMinutes, 'minutes');
    }

    return slots;
  }

  /**
   * Get available tables for a specific time slot
   */
  private async getAvailableTables(
    businessId: string,
    locationId: string | undefined,
    slotTime: moment.Moment,
    duration: number
  ): Promise<Array<{
    id: string;
    number: string;
    capacity: number;
    available: boolean;
  }>> {
    try {
      // Get all tables
      const tables = await prisma.table.findMany({
        where: {
          businessId,
          ...(locationId && { locationId }),
          isActive: true
        },
        select: {
          id: true,
          number: true,
          capacity: true
        }
      });

      // Check each table's availability
      const availabilityPromises = tables.map(async (table) => {
        const isAvailable = await this.isTableAvailable(table.id, slotTime, duration);
        return {
          ...table,
          available: isAvailable
        };
      });

      return await Promise.all(availabilityPromises);

    } catch (error) {
      logger.error('Error getting available tables:', error);
      throw error;
    }
  }

  /**
   * Check if a table is available for a specific time period
   */
  private async isTableAvailable(tableId: string, startTime: moment.Moment, duration: number): Promise<boolean> {
    try {
      const endTime = startTime.clone().add(duration, 'minutes');

      // For test app, use simplified conflict detection
      // Check database for conflicting bookings with a simple time overlap check
      const conflictingBookings = await prisma.booking.findMany({
        where: {
          tableId,
          status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] },
          AND: [
            {
              // Existing booking starts before our booking ends
              bookingTime: {
                lt: endTime.toDate()
              }
            },
            {
              // Existing booking ends after our booking starts (approximate with duration)
              bookingTime: {
                gte: startTime.clone().subtract(120, 'minutes').toDate() // 2 hours buffer
              }
            }
          ]
        }
      });

      // Check Redis cache for pending reservations
      const cacheKey = `reservation:${tableId}:${startTime.format('YYYY-MM-DD-HH-mm')}`;
      const cachedReservation = await redis.get(cacheKey);

      // For test app, be more permissive - allow some overlaps
      const hasConflicts = conflictingBookings.length > 0;
      const hasCachedReservation = cachedReservation !== null;

      // Log for debugging
      if (hasConflicts || hasCachedReservation) {
        logger.warn(`Table ${tableId} at ${startTime.format('YYYY-MM-DD HH:mm')} - Conflicts: ${conflictingBookings.length}, Cached: ${hasCachedReservation}`);
      }

      return !hasConflicts && !hasCachedReservation;

    } catch (error) {
      logger.error('Error checking table availability:', error);
      return false;
    }
  }

  /**
   * Detect booking conflicts
   */
  private async detectBookingConflicts(
    businessId: string,
    locationId: string | undefined,
    bookingTime: moment.Moment,
    partySize: number,
    duration: number
  ): Promise<BookingConflict[]> {
    const conflicts: BookingConflict[] = [];

    try {
      // Check if time is within operating hours
      const operatingHours = await this.getOperatingHours(businessId, locationId, bookingTime.day());
      if (!operatingHours.isOpen) {
        conflicts.push({
          conflictType: 'TIME_CONFLICT',
          message: 'Selected time is outside operating hours'
        });
      }

      // Check for table availability
      const availableTables = await this.getAvailableTables(businessId, locationId, bookingTime, duration);
      const suitableTables = availableTables.filter(table => 
        table.capacity >= partySize && table.available
      );

      if (suitableTables.length === 0) {
        // Suggest alternative times
        const suggestedTimes = await this.findAlternativeTimes(
          businessId,
          locationId,
          bookingTime,
          partySize,
          duration
        );

        conflicts.push({
          conflictType: 'TABLE_UNAVAILABLE',
          message: 'No suitable table available for the requested time',
          suggestedTimes
        });
      }

      return conflicts;

    } catch (error) {
      logger.error('Error detecting booking conflicts:', error);
      throw error;
    }
  }

  /**
   * Find best table for a booking
   */
  private async findBestTable(
    businessId: string,
    locationId: string | undefined,
    bookingTime: moment.Moment,
    partySize: number,
    duration: number
  ): Promise<string | null> {
    try {
      const availableTables = await this.getAvailableTables(businessId, locationId, bookingTime, duration);
      
      logger.info(`Found ${availableTables.length} tables for ${bookingTime.format('YYYY-MM-DD HH:mm')}, partySize: ${partySize}`);
      
      // Filter suitable tables
      const suitableTables = availableTables.filter(table => 
        table.capacity >= partySize && table.available
      );

      logger.info(`${suitableTables.length} suitable tables found (capacity >= ${partySize} and available)`);
      
      if (availableTables.length > 0) {
        logger.info('Table availability:', availableTables.map(t => `Table ${t.number}: capacity=${t.capacity}, available=${t.available}`));
      }

      if (suitableTables.length === 0) {
        return null;
      }

      // Sort by capacity (prefer smaller tables to optimize utilization)
      suitableTables.sort((a, b) => a.capacity - b.capacity);

      logger.info(`Selected table: ${suitableTables[0].number} (capacity: ${suitableTables[0].capacity})`);
      return suitableTables[0].id;

    } catch (error) {
      logger.error('Error finding best table:', error);
      return null;
    }
  }

  /**
   * Find alternative time slots
   */
  private async findAlternativeTimes(
    businessId: string,
    locationId: string | undefined,
    preferredTime: moment.Moment,
    partySize: number,
    duration: number
  ): Promise<string[]> {
    try {
      const alternatives: string[] = [];
      const searchRange = 2; // hours before and after

      // Search for alternatives within the same day
      for (let i = 1; i <= searchRange * 4; i++) { // 15-minute intervals
        const earlierTime = preferredTime.clone().subtract(i * 15, 'minutes');
        const laterTime = preferredTime.clone().add(i * 15, 'minutes');

        // Check earlier time
        if (earlierTime.hour() >= 8) { // Assuming earliest opening is 8 AM
          const earlierAvailable = await this.checkSlotAvailability(
            businessId,
            locationId,
            earlierTime,
            partySize,
            duration
          );
                   if (earlierAvailable?.available) {
           alternatives.push(earlierTime.format('HH:mm'));
         }
        }

        // Check later time
        if (laterTime.hour() <= 22) { // Assuming latest closing is 10 PM
          const laterAvailable = await this.checkSlotAvailability(
            businessId,
            locationId,
            laterTime,
            partySize,
            duration
          );
                   if (laterAvailable?.available) {
           alternatives.push(laterTime.format('HH:mm'));
         }
        }

        // Limit alternatives to avoid overwhelming the user
        if (alternatives.length >= 5) {
          break;
        }
      }

      return alternatives;

    } catch (error) {
      logger.error('Error finding alternative times:', error);
      return [];
    }
  }

  /**
   * Cache a reservation to prevent overbooking
   */
  private async cacheReservation(
    businessId: string,
    locationId: string | undefined,
    bookingTime: moment.Moment,
    tableId: string,
    duration: number
  ): Promise<void> {
    try {
      const cacheKey = `reservation:${tableId}:${bookingTime.format('YYYY-MM-DD-HH-mm')}`;
      const cacheValue = JSON.stringify({
        businessId,
        locationId,
        tableId,
        bookingTime: bookingTime.toISOString(),
        duration,
        timestamp: Date.now()
      });

      // Cache for 10 minutes (enough time to complete booking)
      await redis.setex(cacheKey, 600, cacheValue);

    } catch (error) {
      logger.error('Error caching reservation:', error);
    }
  }

  /**
   * Remove reservation from cache
   */
  private async removeReservationFromCache(
    businessId: string,
    locationId: string | undefined,
    bookingTime: moment.Moment,
    tableId: string,
    duration: number
  ): Promise<void> {
    try {
      const cacheKey = `reservation:${tableId}:${bookingTime.format('YYYY-MM-DD-HH-mm')}`;
      await redis.del(cacheKey);

    } catch (error) {
      logger.error('Error removing reservation from cache:', error);
    }
  }

  /**
   * Acquire distributed lock
   */
  private async acquireLock(lockKey: string): Promise<boolean> {
    try {
      const result = await redis.set(lockKey, 'locked', 'PX', this.lockTimeoutMs, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error('Error acquiring lock:', error);
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(lockKey: string): Promise<void> {
    try {
      await redis.del(lockKey);
    } catch (error) {
      logger.error('Error releasing lock:', error);
    }
  }
}

export const availabilityService = AvailabilityService.getInstance(); 