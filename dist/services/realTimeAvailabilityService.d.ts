import { AvailabilitySlot } from './availabilityService';
export interface AvailabilityUpdate {
    businessId: string;
    locationId?: string | undefined;
    date: string;
    updatedSlots: AvailabilitySlot[];
    updateType: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_UPDATED' | 'TABLE_STATUS_CHANGED';
    timestamp: string;
}
export declare class RealTimeAvailabilityService {
    private static instance;
    private updateBuffer;
    private bufferTimeout;
    private readonly BUFFER_DELAY_MS;
    static getInstance(): RealTimeAvailabilityService;
    /**
     * Notify availability change when booking is created
     */
    notifyBookingCreated(businessId: string, locationId: string | undefined, bookingDateTime: string, partySize: number, duration: number): Promise<void>;
    /**
     * Notify availability change when booking is cancelled
     */
    notifyBookingCancelled(businessId: string, locationId: string | undefined, bookingDateTime: string, partySize: number, duration: number): Promise<void>;
    /**
     * Notify availability change when booking is updated
     */
    notifyBookingUpdated(businessId: string, locationId: string | undefined, oldBookingDateTime: string, newBookingDateTime: string, partySize: number, duration: number): Promise<void>;
    /**
     * Notify availability change when table status changes
     */
    notifyTableStatusChanged(businessId: string, locationId: string | undefined, tableId: string, newStatus: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE'): Promise<void>;
    /**
     * Get cached availability or fetch fresh data
     */
    getCachedAvailability(businessId: string, locationId: string | undefined, date: string, partySize: number, duration?: number): Promise<AvailabilitySlot[]>;
    /**
     * Clear cached availability for a specific date
     */
    clearAvailabilityCache(businessId: string, locationId: string | undefined, date: string): Promise<void>;
    /**
     * Subscribe to availability updates for a specific business and date
     */
    subscribeToAvailabilityUpdates(businessId: string, locationId: string | undefined, date: string, socketId: string): Promise<void>;
    /**
     * Unsubscribe from availability updates
     */
    unsubscribeFromAvailabilityUpdates(businessId: string, locationId: string | undefined, date: string, socketId: string): Promise<void>;
    /**
     * Get updated availability for a specific date
     */
    private getUpdatedAvailability;
    /**
     * Buffer updates to avoid spam
     */
    private bufferUpdate;
    /**
     * Process all buffered updates
     */
    private processBufferedUpdates;
    /**
     * Start periodic availability refresh for active subscriptions
     */
    startPeriodicRefresh(): void;
}
export declare const realTimeAvailabilityService: RealTimeAvailabilityService;
//# sourceMappingURL=realTimeAvailabilityService.d.ts.map