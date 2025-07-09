export interface SMSData {
    to: string;
    message: string;
}
export interface BookingConfirmationSMSData {
    customerName: string;
    customerPhone: string;
    businessName: string;
    bookingDate: string;
    bookingTime: string;
    partySize: number;
    confirmationCode: string;
}
export interface BookingReminderSMSData {
    customerName: string;
    customerPhone: string;
    businessName: string;
    bookingDate: string;
    bookingTime: string;
    confirmationCode: string;
    reminderType: 'day_before' | 'hour_before' | 'custom';
}
export interface BookingCancellationSMSData {
    customerName: string;
    customerPhone: string;
    businessName: string;
    bookingDate: string;
    bookingTime: string;
    cancellationReason?: string;
}
export interface WaitlistNotificationSMSData {
    customerName: string;
    customerPhone: string;
    businessName: string;
    position: number;
    estimatedWaitTime?: number;
}
export interface TableReadySMSData {
    customerName: string;
    customerPhone: string;
    businessName: string;
    confirmationCode: string;
}
export declare class SMSService {
    private client;
    private fromNumber;
    constructor();
    sendSMS(data: SMSData): Promise<boolean>;
    sendBookingConfirmation(data: BookingConfirmationSMSData): Promise<boolean>;
    sendBookingReminder(data: BookingReminderSMSData): Promise<boolean>;
    sendBookingCancellation(data: BookingCancellationSMSData): Promise<boolean>;
    sendWaitlistNotification(data: WaitlistNotificationSMSData): Promise<boolean>;
    sendTableReadyNotification(data: TableReadySMSData): Promise<boolean>;
    private getBookingConfirmationMessage;
    private getBookingReminderMessage;
    private getBookingCancellationMessage;
    private getWaitlistNotificationMessage;
    private getTableReadyMessage;
    formatPhoneNumber(phone: string): string;
    validatePhoneNumber(phone: string): boolean;
    testConnection(): Promise<boolean>;
}
export declare const smsService: SMSService;
//# sourceMappingURL=smsService.d.ts.map