export interface EmailTemplate {
    subject: string;
    html: string;
    text?: string;
}
export interface EmailData {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: any[];
}
export interface BookingConfirmationData {
    customerName: string;
    customerEmail: string;
    businessName: string;
    bookingDate: string;
    bookingTime: string;
    partySize: number;
    confirmationCode: string;
    specialRequests?: string;
    businessPhone?: string;
    businessAddress?: string;
}
export interface BookingReminderData {
    customerName: string;
    customerEmail: string;
    businessName: string;
    bookingDate: string;
    bookingTime: string;
    partySize: number;
    confirmationCode: string;
    businessPhone?: string;
    businessAddress?: string;
    reminderType: 'day_before' | 'hour_before' | 'custom';
}
export interface BookingCancellationData {
    customerName: string;
    customerEmail: string;
    businessName: string;
    bookingDate: string;
    bookingTime: string;
    cancellationReason?: string;
    refundAmount?: number;
}
export interface WaitlistNotificationData {
    customerName: string;
    customerEmail: string;
    businessName: string;
    position: number;
    estimatedWaitTime?: number;
    businessPhone?: string;
}
export declare class EmailService {
    private transporter;
    constructor();
    sendEmail(emailData: EmailData): Promise<boolean>;
    sendBookingConfirmation(data: BookingConfirmationData): Promise<boolean>;
    sendBookingReminder(data: BookingReminderData): Promise<boolean>;
    sendBookingCancellation(data: BookingCancellationData): Promise<boolean>;
    sendWaitlistNotification(data: WaitlistNotificationData): Promise<boolean>;
    private getBookingConfirmationTemplate;
    private getBookingReminderTemplate;
    private getBookingCancellationTemplate;
    private getWaitlistNotificationTemplate;
    private htmlToText;
    testConnection(): Promise<boolean>;
}
export declare const emailService: EmailService;
//# sourceMappingURL=emailService.d.ts.map