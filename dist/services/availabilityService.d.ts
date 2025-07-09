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
export declare class AvailabilityService {
    private static instance;
    private lockTimeoutMs;
    private slotIntervalMinutes;
    static getInstance(): AvailabilityService;
    /**
     * Get available time slots for a specific date and party size
     */
    getAvailableSlots(request: AvailabilityRequest): Promise<AvailabilitySlot[]>;
    /**
     * Check if a specific time slot is available
     */
    checkSlotAvailability(businessId: string, locationId: string | undefined, slotTime: moment.Moment, partySize: number, duration: number): Promise<{
        available: boolean;
        capacity: number;
        reserved: number;
        tables: Array<{
            id: string;
            number: string;
            capacity: number;
            available: boolean;
        }>;
    }>;
    /**
     * Reserve a time slot with conflict detection
     */
    reserveSlot(businessId: string, locationId: string | undefined, dateTime: string, partySize: number, duration: number, customerId: string): Promise<{
        success: boolean;
        tableId?: string;
        conflicts?: BookingConflict[];
    }>;
    /**
     * Release a reserved slot
     */
    releaseSlot(businessId: string, locationId: string | undefined, dateTime: string, tableId: string, duration: number): Promise<void>;
    /**
     * Get operating hours for a specific day
     */
    private getOperatingHours;
    /**
     * Generate time slots for a given date and operating hours
     */
    private generateTimeSlots;
    /**
     * Get available tables for a specific time slot
     */
    private getAvailableTables;
    /**
     * Check if a table is available for a specific time period
     */
    private isTableAvailable;
    /**
     * Detect booking conflicts
     */
    private detectBookingConflicts;
    /**
     * Find best table for a booking
     */
    private findBestTable;
    /**
     * Find alternative time slots
     */
    private findAlternativeTimes;
    /**
     * Cache a reservation to prevent overbooking
     */
    private cacheReservation;
    /**
     * Remove reservation from cache
     */
    private removeReservationFromCache;
    /**
     * Acquire distributed lock
     */
    private acquireLock;
    /**
     * Release distributed lock
     */
    private releaseLock;
}
export declare const availabilityService: AvailabilityService;
//# sourceMappingURL=availabilityService.d.ts.map