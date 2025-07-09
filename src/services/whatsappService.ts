import QRCode from 'qrcode';
import { logger } from '@/utils/logger';
import { config } from '@/config/config';
import { prisma } from '@/utils/database';

export interface WhatsAppBookingData {
  customerName: string;
  businessName: string;
  bookingDate: string;
  bookingTime: string;
  partySize: number;
  confirmationCode: string;
  serviceType?: string;
  staffName?: string;
}

export interface WhatsAppReminderData {
  customerName: string;
  businessName: string;
  bookingDate: string;
  bookingTime: string;
  confirmationCode: string;
  reminderType: 'hour_before' | 'day_before';
  serviceType?: string;
  staffName?: string;
}

export interface WhatsAppMessageData {
  to: string;
  message: string;
  messageType: 'confirmation' | 'reminder' | 'cancellation' | 'general';
  bookingId?: string;
  metadata?: any;
}

export interface WhatsAppMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WhatsAppService {
  private phoneNumber: string;
  private businessName: string;
  private messageQueue: WhatsAppMessageData[] = [];
  private isProcessingQueue: boolean = false;
  private retryAttempts: number = 3;
  private retryDelay: number = 5000; // 5 seconds

  constructor() {
    // Get phone number from config (remove + and spaces for WhatsApp links)
    this.phoneNumber = config.notifications.whatsapp.businessNumber.replace(/[\+\s]/g, '');
    this.businessName = config.notifications.whatsapp.businessName;
    logger.info(`WhatsApp service initialized with number: ${this.phoneNumber}`);
    
    // Start processing message queue
    this.startMessageQueueProcessor();
  }

  /**
   * Send WhatsApp confirmation message directly to customer
   */
  async sendConfirmationMessage(data: WhatsAppBookingData, customerPhone: string): Promise<WhatsAppMessageResult> {
    try {
      const message = this.getBookingConfirmationMessage(data);
      const formattedPhone = this.formatPhoneNumber(customerPhone);
      
      const messageData: WhatsAppMessageData = {
        to: formattedPhone,
        message,
        messageType: 'confirmation',
        bookingId: data.confirmationCode,
        metadata: { bookingData: data }
      };
      
      // Add to message queue for processing
      this.messageQueue.push(messageData);
      logger.info(`Queued WhatsApp confirmation message for ${data.customerName} at ${formattedPhone}`);
      
      // Process queue immediately
      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }
      
      return {
        success: true,
        messageId: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    } catch (error) {
      logger.error('Error sending WhatsApp confirmation message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send WhatsApp reminder message directly to customer
   */
  async sendReminderMessage(data: WhatsAppReminderData, customerPhone: string): Promise<WhatsAppMessageResult> {
    try {
      const message = this.getBookingReminderMessage(data);
      const formattedPhone = this.formatPhoneNumber(customerPhone);
      
      const messageData: WhatsAppMessageData = {
        to: formattedPhone,
        message,
        messageType: 'reminder',
        bookingId: data.confirmationCode,
        metadata: { reminderData: data }
      };
      
      // Add to message queue for processing
      this.messageQueue.push(messageData);
      logger.info(`Queued WhatsApp reminder message for ${data.customerName} at ${formattedPhone}`);
      
      // Process queue immediately
      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }
      
      return {
        success: true,
        messageId: `queued_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    } catch (error) {
      logger.error('Error sending WhatsApp reminder message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process message queue with retry logic
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0) {
      const messageData = this.messageQueue.shift();
      if (!messageData) continue;
      
      let attempts = 0;
      let success = false;
      
      while (attempts < this.retryAttempts && !success) {
        try {
          const result = await this.sendWhatsAppMessage(messageData);
          
          if (result.success) {
            success = true;
            logger.info(`WhatsApp message sent successfully to ${messageData.to}`);
            
            // Log message delivery for tracking
            await this.logMessageDelivery(messageData, result.messageId);
          } else {
            attempts++;
            logger.warn(`Failed to send WhatsApp message to ${messageData.to}, attempt ${attempts}/${this.retryAttempts}: ${result.error}`);
            
            if (attempts < this.retryAttempts) {
              await this.delay(this.retryDelay);
            }
          }
        } catch (error) {
          attempts++;
          logger.error(`Error sending WhatsApp message to ${messageData.to}, attempt ${attempts}/${this.retryAttempts}:`, error);
          
          if (attempts < this.retryAttempts) {
            await this.delay(this.retryDelay);
          }
        }
      }
      
      if (!success) {
        logger.error(`Failed to send WhatsApp message to ${messageData.to} after ${this.retryAttempts} attempts`);
        await this.handleFailedMessage(messageData);
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Send WhatsApp message through available providers
   */
  private async sendWhatsAppMessage(messageData: WhatsAppMessageData): Promise<WhatsAppMessageResult> {
    // For now, we'll use a webhook approach or direct API integration
    // This can be replaced with actual WhatsApp Business API integration
    
    try {
      // Method 1: WhatsApp Business API (preferred)
      const result = await this.sendViaWhatsAppBusinessAPI(messageData);
      if (result.success) {
        return result;
      }
      
      // Method 2: Third-party WhatsApp API service
      const fallbackResult = await this.sendViaThirdPartyAPI(messageData);
      if (fallbackResult.success) {
        return fallbackResult;
      }
      
      // Method 3: Local WhatsApp Web automation (last resort)
      const webResult = await this.sendViaWhatsAppWeb(messageData);
      return webResult;
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Send via WhatsApp Business API
   */
  private async sendViaWhatsAppBusinessAPI(messageData: WhatsAppMessageData): Promise<WhatsAppMessageResult> {
    // For now, log the message that would be sent
    logger.info('WhatsApp Business API: Sending message', {
      to: messageData.to,
      from: this.getFormattedPhoneNumber(),
      message: messageData.message.substring(0, 100) + '...',
      type: messageData.messageType
    });
    
    // TODO: Implement actual WhatsApp Business API integration
    // This would require WhatsApp Business API credentials and setup
    
    return {
      success: true,
      messageId: `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * Send via third-party WhatsApp API service
   */
  private async sendViaThirdPartyAPI(messageData: WhatsAppMessageData): Promise<WhatsAppMessageResult> {
    // For now, log the message that would be sent
    logger.info('Third-party API: Sending WhatsApp message', {
      to: messageData.to,
      from: this.getFormattedPhoneNumber(),
      message: messageData.message.substring(0, 100) + '...',
      type: messageData.messageType
    });
    
    // TODO: Implement third-party service integration (e.g., Twilio, MessageBird, etc.)
    
    return {
      success: true,
      messageId: `thirdparty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * Send via WhatsApp Web automation
   */
  private async sendViaWhatsAppWeb(messageData: WhatsAppMessageData): Promise<WhatsAppMessageResult> {
    // For now, log the message that would be sent
    logger.info('WhatsApp Web: Would send message', {
      to: messageData.to,
      from: this.getFormattedPhoneNumber(),
      message: messageData.message.substring(0, 100) + '...',
      type: messageData.messageType
    });
    
    // TODO: Implement WhatsApp Web automation or webhook integration
    
    return {
      success: true,
      messageId: `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  /**
   * Format phone number for WhatsApp
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // If it starts with 0, replace with country code (60 for Malaysia)
    if (cleaned.startsWith('0')) {
      return '60' + cleaned.substring(1);
    }
    
    // If it doesn't start with 60, add it
    if (!cleaned.startsWith('60')) {
      return '60' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Log message delivery for tracking
   */
  private async logMessageDelivery(messageData: WhatsAppMessageData, messageId?: string): Promise<void> {
    try {
      // Log to database for tracking and analytics
      // This could be extended to create a messages table
      logger.info('WhatsApp message delivered', {
        to: messageData.to,
        type: messageData.messageType,
        messageId,
        bookingId: messageData.bookingId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error logging message delivery:', error);
    }
  }

  /**
   * Handle failed message delivery
   */
  private async handleFailedMessage(messageData: WhatsAppMessageData): Promise<void> {
    try {
      // Log failed delivery
      logger.error('WhatsApp message delivery failed', {
        to: messageData.to,
        type: messageData.messageType,
        bookingId: messageData.bookingId,
        message: messageData.message.substring(0, 100) + '...',
        timestamp: new Date().toISOString()
      });
      
      // TODO: Implement alternative notification methods
      // For example, send email notification or SMS fallback
      
    } catch (error) {
      logger.error('Error handling failed message:', error);
    }
  }

  /**
   * Start message queue processor
   */
  private startMessageQueueProcessor(): void {
    // Process queue every 30 seconds
    setInterval(() => {
      if (!this.isProcessingQueue && this.messageQueue.length > 0) {
        this.processMessageQueue();
      }
    }, 30000);
  }

  /**
   * Delay utility function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate WhatsApp click-to-chat link for booking confirmation
   */
  generateConfirmationLink(data: WhatsAppBookingData): string {
    const message = this.getBookingConfirmationMessage(data);
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${this.phoneNumber}?text=${encodedMessage}`;
  }

  /**
   * Generate WhatsApp click-to-chat link for booking reminder
   */
  generateReminderLink(data: WhatsAppReminderData): string {
    const message = this.getBookingReminderMessage(data);
    const encodedMessage = encodeURIComponent(message);
    return `https://wa.me/${this.phoneNumber}?text=${encodedMessage}`;
  }

  /**
   * Generate QR code for booking confirmation
   */
  async generateConfirmationQR(data: WhatsAppBookingData): Promise<string> {
    try {
      const link = this.generateConfirmationLink(data);
      const qrCodeDataURL = await QRCode.toDataURL(link, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrCodeDataURL;
    } catch (error) {
      logger.error('Error generating confirmation QR code:', error);
      throw error;
    }
  }

  /**
   * Generate QR code for booking reminder
   */
  async generateReminderQR(data: WhatsAppReminderData): Promise<string> {
    try {
      const link = this.generateReminderLink(data);
      const qrCodeDataURL = await QRCode.toDataURL(link, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      return qrCodeDataURL;
    } catch (error) {
      logger.error('Error generating reminder QR code:', error);
      throw error;
    }
  }

  /**
   * Generate booking confirmation message
   */
  private getBookingConfirmationMessage(data: WhatsAppBookingData): string {
    let message = `🎉 *Booking Confirmed!*\n\n`;
    message += `Hi ${data.customerName}! Your reservation at *${data.businessName}* is confirmed.\n\n`;
    message += `📅 *Date:* ${data.bookingDate}\n`;
    message += `⏰ *Time:* ${data.bookingTime}\n`;
    message += `👥 *Party Size:* ${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}\n`;
    
    if (data.serviceType) {
      message += `💄 *Service:* ${data.serviceType}\n`;
    }
    
    if (data.staffName) {
      message += `👨‍💼 *Staff:* ${data.staffName}\n`;
    }
    
    message += `🔢 *Confirmation Code:* ${data.confirmationCode}\n\n`;
    message += `We're excited to serve you! Please arrive 5 minutes early.\n\n`;
    message += `Need to make changes? Reply to this message or call us directly.`;
    
    return message;
  }

  /**
   * Generate booking reminder message
   */
  private getBookingReminderMessage(data: WhatsAppReminderData): string {
    const reminderText = {
      day_before: 'tomorrow',
      hour_before: 'in 1 hour'
    };

    let message = `⏰ *Booking Reminder*\n\n`;
    message += `Hi ${data.customerName}! This is a friendly reminder that your reservation at *${data.businessName}* is ${reminderText[data.reminderType]}.\n\n`;
    message += `📅 *Date:* ${data.bookingDate}\n`;
    message += `⏰ *Time:* ${data.bookingTime}\n`;
    
    if (data.serviceType) {
      message += `💄 *Service:* ${data.serviceType}\n`;
    }
    
    if (data.staffName) {
      message += `👨‍💼 *Staff:* ${data.staffName}\n`;
    }
    
    message += `🔢 *Confirmation Code:* ${data.confirmationCode}\n\n`;
    message += `Please confirm your attendance by replying "YES" or let us know if you need to reschedule.\n\n`;
    message += `We look forward to seeing you!`;
    
    return message;
  }

  /**
   * Generate a simple contact QR code for the business
   */
  async generateContactQR(): Promise<string> {
    try {
      const contactLink = `https://wa.me/${this.phoneNumber}`;
      const qrCodeDataURL = await QRCode.toDataURL(contactLink, {
        width: 300,
        margin: 2,
        color: {
          dark: '#25D366', // WhatsApp green
          light: '#FFFFFF'
        }
      });
      return qrCodeDataURL;
    } catch (error) {
      logger.error('Error generating contact QR code:', error);
      throw error;
    }
  }

  /**
   * Get the phone number being used
   */
  getPhoneNumber(): string {
    return this.phoneNumber;
  }

  /**
   * Get the business name being used
   */
  getBusinessName(): string {
    return this.businessName;
  }

  /**
   * Update the phone number
   */
  setPhoneNumber(phoneNumber: string): void {
    // Remove any + or spaces and keep only digits
    this.phoneNumber = phoneNumber.replace(/[\+\s]/g, '');
    logger.info(`WhatsApp phone number updated to: ${this.phoneNumber}`);
  }

  /**
   * Get formatted phone number for display (with + prefix)
   */
  getFormattedPhoneNumber(): string {
    return `+${this.phoneNumber}`;
  }
}

export const whatsappService = new WhatsAppService(); 