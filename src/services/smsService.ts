import { Twilio } from 'twilio';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { ApiError } from '@/middleware/errorHandler';

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

export class SMSService {
  private client: Twilio | null;
  private fromNumber: string;
  private isEnabled: boolean;

  constructor() {
    // Check if Twilio is properly configured
    this.isEnabled = this.isTwilioConfigured();
    
    if (this.isEnabled) {
      try {
        this.client = new Twilio(
          config.notifications.twilio.accountSid,
          config.notifications.twilio.authToken
        );
        this.fromNumber = config.notifications.twilio.phoneNumber;
      } catch (error) {
        logger.error('Failed to initialize Twilio client:', error);
        this.isEnabled = false;
        this.client = null;
        this.fromNumber = '';
      }
    } else {
      this.client = null;
      this.fromNumber = '';
      logger.warn('Twilio SMS service is not configured. SMS notifications will be disabled.');
    }
  }

  private isTwilioConfigured(): boolean {
    const { accountSid, authToken, phoneNumber } = config.notifications.twilio;
    
    // Check if all required fields are present and not empty
    if (!accountSid || !authToken || !phoneNumber) {
      return false;
    }
    
    // Check if accountSid has proper format
    if (typeof accountSid !== 'string' || !accountSid.startsWith('AC') || accountSid.length <= 10) {
      return false;
    }
    
    // Check if authToken has proper length
    if (typeof authToken !== 'string' || authToken.length <= 10) {
      return false;
    }
    
    // Check if phoneNumber is not empty
    if (typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      return false;
    }
    
    return true;
  }

  async sendSMS(data: SMSData): Promise<boolean> {
    if (!this.isEnabled || !this.client) {
      logger.warn(`SMS service not configured. Would have sent SMS to ${data.to}: ${data.message}`);
      return false;
    }

    try {
      const result = await this.client.messages.create({
        body: data.message,
        from: this.fromNumber,
        to: data.to
      });

      logger.info(`SMS sent successfully to ${data.to}`, { sid: result.sid });
      return true;
    } catch (error) {
      logger.error('Error sending SMS:', error);
      return false;
    }
  }

  async sendBookingConfirmation(data: BookingConfirmationSMSData): Promise<boolean> {
    try {
      const message = this.getBookingConfirmationMessage(data);
      
      return await this.sendSMS({
        to: data.customerPhone,
        message
      });
    } catch (error) {
      logger.error('Error sending booking confirmation SMS:', error);
      return false;
    }
  }

  async sendBookingReminder(data: BookingReminderSMSData): Promise<boolean> {
    try {
      const message = this.getBookingReminderMessage(data);
      
      return await this.sendSMS({
        to: data.customerPhone,
        message
      });
    } catch (error) {
      logger.error('Error sending booking reminder SMS:', error);
      return false;
    }
  }

  async sendBookingCancellation(data: BookingCancellationSMSData): Promise<boolean> {
    try {
      const message = this.getBookingCancellationMessage(data);
      
      return await this.sendSMS({
        to: data.customerPhone,
        message
      });
    } catch (error) {
      logger.error('Error sending booking cancellation SMS:', error);
      return false;
    }
  }

  async sendWaitlistNotification(data: WaitlistNotificationSMSData): Promise<boolean> {
    try {
      const message = this.getWaitlistNotificationMessage(data);
      
      return await this.sendSMS({
        to: data.customerPhone,
        message
      });
    } catch (error) {
      logger.error('Error sending waitlist notification SMS:', error);
      return false;
    }
  }

  async sendTableReadyNotification(data: TableReadySMSData): Promise<boolean> {
    try {
      const message = this.getTableReadyMessage(data);
      
      return await this.sendSMS({
        to: data.customerPhone,
        message
      });
    } catch (error) {
      logger.error('Error sending table ready SMS:', error);
      return false;
    }
  }

  private getBookingConfirmationMessage(data: BookingConfirmationSMSData): string {
    return `Hi ${data.customerName}! Your reservation at ${data.businessName} is confirmed for ${data.bookingDate} at ${data.bookingTime} for ${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}. Confirmation code: ${data.confirmationCode}. See you soon!`;
  }

  private getBookingReminderMessage(data: BookingReminderSMSData): string {
    const reminderText = {
      day_before: 'tomorrow',
      hour_before: 'in 1 hour',
      custom: 'soon'
    };

    return `Hi ${data.customerName}! Friendly reminder: Your reservation at ${data.businessName} is ${reminderText[data.reminderType]} (${data.bookingDate} at ${data.bookingTime}). Confirmation code: ${data.confirmationCode}. We look forward to seeing you!`;
  }

  private getBookingCancellationMessage(data: BookingCancellationSMSData): string {
    let message = `Hi ${data.customerName}, your reservation at ${data.businessName} for ${data.bookingDate} at ${data.bookingTime} has been cancelled.`;
    
    if (data.cancellationReason) {
      message += ` Reason: ${data.cancellationReason}.`;
    }
    
    message += ' We apologize for any inconvenience. Hope to serve you again soon!';
    
    return message;
  }

  private getWaitlistNotificationMessage(data: WaitlistNotificationSMSData): string {
    let message = `Hi ${data.customerName}! You're #${data.position} on the waitlist at ${data.businessName}.`;
    
    if (data.estimatedWaitTime) {
      message += ` Estimated wait time: ${data.estimatedWaitTime} minutes.`;
    }
    
    message += ' We\'ll notify you when your table is ready. Please stay nearby!';
    
    return message;
  }

  private getTableReadyMessage(data: TableReadySMSData): string {
    return `Great news ${data.customerName}! Your table is ready at ${data.businessName}. Please come to the host stand with confirmation code: ${data.confirmationCode}. Thanks for your patience!`;
  }

  formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    } else if (cleaned.startsWith('+')) {
      return phone;
    }
    
    return phone; // Return as-is if format is unclear
  }

  validatePhoneNumber(phone: string): boolean {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  async testConnection(): Promise<boolean> {
    if (!this.isEnabled || !this.client) {
      logger.warn('SMS service not configured - connection test skipped');
      return false;
    }

    try {
      // Test by fetching account info
      const account = await this.client.api.accounts(config.notifications.twilio.accountSid).fetch();
      logger.info('SMS service connection verified successfully', { accountSid: account.sid });
      return true;
    } catch (error) {
      logger.error('SMS service connection failed:', error);
      return false;
    }
  }
}

export const smsService = new SMSService(); 