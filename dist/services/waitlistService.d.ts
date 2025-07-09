import { WaitlistEntry, WaitlistStatus } from '@prisma/client';
export interface CreateWaitlistEntryData {
    customerId: string;
    businessId: string;
    locationId?: string;
    partySize: number;
    preferredTime?: Date;
    specialRequests?: string;
}
export interface UpdateWaitlistEntryData {
    estimatedWaitTime?: number;
    specialRequests?: string;
    status?: WaitlistStatus;
}
export interface WaitlistFilters {
    businessId: string;
    locationId?: string;
    status?: WaitlistStatus;
    minPartySize?: number;
    maxPartySize?: number;
    dateFrom?: Date;
    dateTo?: Date;
}
export interface WaitlistStats {
    totalWaiting: number;
    averageWaitTime: number;
    totalSeated: number;
    totalLeft: number;
    averagePosition: number;
}
export declare class WaitlistService {
    private readonly POSITION_UPDATE_INTERVAL;
    private readonly NOTIFICATION_COOLDOWN;
    addToWaitlist(data: CreateWaitlistEntryData): Promise<WaitlistEntry>;
    updateWaitlistEntry(entryId: string, businessId: string, data: UpdateWaitlistEntryData): Promise<WaitlistEntry>;
    removeFromWaitlist(entryId: string, businessId: string, reason?: string): Promise<void>;
    getWaitlistByBusiness(filters: WaitlistFilters, page?: number, limit?: number): Promise<{
        entries: WaitlistEntry[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getWaitlistStats(businessId: string, locationId?: string): Promise<WaitlistStats>;
    getCustomerPosition(customerId: string, businessId: string): Promise<WaitlistEntry | null>;
    updateWaitTimeEstimates(businessId: string, locationId?: string): Promise<void>;
    notifyNext(businessId: string, locationId?: string, count?: number): Promise<void>;
    private getNextPosition;
    private updatePositionsAfterSeating;
    private updatePositionsAfterRemoval;
    private calculateAverageWaitTime;
    private sendWaitlistNotification;
    private sendTableReadyNotification;
    startPeriodicUpdates(): Promise<void>;
}
export declare const waitlistService: WaitlistService;
//# sourceMappingURL=waitlistService.d.ts.map