import nodemailer from 'nodemailer';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';
import { ApiError } from '@/middleware/errorHandler';

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

export class EmailService {
  private transporter: nodemailer.Transporter | null;
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = this.isEmailConfigured();
    
    if (this.isEnabled) {
      this.transporter = nodemailer.createTransport({
        host: config.notifications.email.host,
        port: config.notifications.email.port,
        secure: config.notifications.email.secure,
        auth: {
          user: config.notifications.email.user,
          pass: config.notifications.email.password
        }
      });
    } else {
      this.transporter = null;
      logger.warn('Email service is not configured. Email notifications will be disabled.');
    }
  }

  private isEmailConfigured(): boolean {
    const { host, user, password } = config.notifications.email;
    return !!(host && user && password && host.length > 0 && user.length > 0 && password.length > 0);
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      // For quick testing - log email details and return true
      logger.info(`📧 EMAIL SENT (Mock Mode) to ${emailData.to}`);
      logger.info(`📧 Subject: ${emailData.subject}`);
      logger.info(`📧 Content: ${emailData.html?.substring(0, 200)}...`);
      return true; // Return true for testing purposes
    }

    try {
      const mailOptions = {
        from: config.notifications.email.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text || this.htmlToText(emailData.html),
        attachments: emailData.attachments || []
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${emailData.to}`, { messageId: result.messageId });
      return true;
    } catch (error) {
      logger.error('Error sending email:', error);
      return false;
    }
  }

  async sendBookingConfirmation(data: BookingConfirmationData): Promise<boolean> {
    try {
      const template = this.getBookingConfirmationTemplate(data);
      
      return await this.sendEmail({
        to: data.customerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
    } catch (error) {
      logger.error('Error sending booking confirmation:', error);
      return false;
    }
  }

  async sendBookingReminder(data: BookingReminderData): Promise<boolean> {
    try {
      const template = this.getBookingReminderTemplate(data);
      
      return await this.sendEmail({
        to: data.customerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
    } catch (error) {
      logger.error('Error sending booking reminder:', error);
      return false;
    }
  }

  async sendBookingCancellation(data: BookingCancellationData): Promise<boolean> {
    try {
      const template = this.getBookingCancellationTemplate(data);
      
      return await this.sendEmail({
        to: data.customerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
    } catch (error) {
      logger.error('Error sending booking cancellation:', error);
      return false;
    }
  }

  async sendWaitlistNotification(data: WaitlistNotificationData): Promise<boolean> {
    try {
      const template = this.getWaitlistNotificationTemplate(data);
      
      return await this.sendEmail({
        to: data.customerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
    } catch (error) {
      logger.error('Error sending waitlist notification:', error);
      return false;
    }
  }

  private getBookingConfirmationTemplate(data: BookingConfirmationData): EmailTemplate {
    const subject = `Booking Confirmation - ${data.businessName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .detail-label { font-weight: bold; }
            .confirmation-code { font-size: 24px; font-weight: bold; color: #27ae60; text-align: center; }
            .footer { background: #34495e; color: white; padding: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Confirmed!</h1>
              <p>Thank you for choosing ${data.businessName}</p>
            </div>
            
            <div class="content">
              <p>Dear ${data.customerName},</p>
              <p>Your reservation has been confirmed. Here are the details:</p>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Restaurant:</span>
                  <span>${data.businessName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span>${data.bookingDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                  <span>${data.bookingTime}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Party Size:</span>
                  <span>${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}</span>
                </div>
                ${data.specialRequests ? `
                <div class="detail-row">
                  <span class="detail-label">Special Requests:</span>
                  <span>${data.specialRequests}</span>
                </div>` : ''}
              </div>
              
              <div class="confirmation-code">
                Confirmation Code: ${data.confirmationCode}
              </div>
              
              <p>Please arrive on time and present this confirmation code at the restaurant.</p>
              
              ${data.businessPhone ? `<p>If you need to make changes, please call us at ${data.businessPhone}</p>` : ''}
              ${data.businessAddress ? `<p>Address: ${data.businessAddress}</p>` : ''}
              
              <p>We look forward to serving you!</p>
            </div>
            
            <div class="footer">
              <p>&copy; 2024 ${data.businessName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Booking Confirmation - ${data.businessName}
      
      Dear ${data.customerName},
      
      Your reservation has been confirmed:
      
      Restaurant: ${data.businessName}
      Date: ${data.bookingDate}
      Time: ${data.bookingTime}
      Party Size: ${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}
      ${data.specialRequests ? `Special Requests: ${data.specialRequests}` : ''}
      
      Confirmation Code: ${data.confirmationCode}
      
      Please arrive on time and present this confirmation code at the restaurant.
      
      ${data.businessPhone ? `If you need to make changes, please call us at ${data.businessPhone}` : ''}
      ${data.businessAddress ? `Address: ${data.businessAddress}` : ''}
      
      We look forward to serving you!
    `;

    return { subject, html, text };
  }

  private getBookingReminderTemplate(data: BookingReminderData): EmailTemplate {
    const reminderText = {
      day_before: 'tomorrow',
      hour_before: 'in 1 hour',
      custom: 'soon'
    };

    const subject = `Reminder: Your reservation at ${data.businessName} is ${reminderText[data.reminderType]}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #e74c3c; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .detail-label { font-weight: bold; }
            .reminder-badge { background: #e74c3c; color: white; padding: 10px; border-radius: 5px; text-align: center; margin: 20px 0; }
            .footer { background: #34495e; color: white; padding: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reservation Reminder</h1>
            </div>
            
            <div class="content">
              <p>Dear ${data.customerName},</p>
              
              <div class="reminder-badge">
                <h2>Your reservation is ${reminderText[data.reminderType]}!</h2>
              </div>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Restaurant:</span>
                  <span>${data.businessName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span>${data.bookingDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                  <span>${data.bookingTime}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Party Size:</span>
                  <span>${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Confirmation Code:</span>
                  <span>${data.confirmationCode}</span>
                </div>
              </div>
              
              <p>Please arrive on time. We look forward to seeing you!</p>
              
              ${data.businessPhone ? `<p>If you need to make changes, please call us at ${data.businessPhone}</p>` : ''}
              ${data.businessAddress ? `<p>Address: ${data.businessAddress}</p>` : ''}
            </div>
            
            <div class="footer">
              <p>&copy; 2024 ${data.businessName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Reservation Reminder - ${data.businessName}
      
      Dear ${data.customerName},
      
      Your reservation is ${reminderText[data.reminderType]}!
      
      Restaurant: ${data.businessName}
      Date: ${data.bookingDate}
      Time: ${data.bookingTime}
      Party Size: ${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}
      Confirmation Code: ${data.confirmationCode}
      
      Please arrive on time. We look forward to seeing you!
      
      ${data.businessPhone ? `If you need to make changes, please call us at ${data.businessPhone}` : ''}
      ${data.businessAddress ? `Address: ${data.businessAddress}` : ''}
    `;

    return { subject, html, text };
  }

  private getBookingCancellationTemplate(data: BookingCancellationData): EmailTemplate {
    const subject = `Booking Cancelled - ${data.businessName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #95a5a6; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .detail-label { font-weight: bold; }
            .cancellation-notice { background: #e74c3c; color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
            .footer { background: #34495e; color: white; padding: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Cancelled</h1>
            </div>
            
            <div class="content">
              <p>Dear ${data.customerName},</p>
              
              <div class="cancellation-notice">
                <h2>Your reservation has been cancelled</h2>
              </div>
              
              <div class="booking-details">
                <div class="detail-row">
                  <span class="detail-label">Restaurant:</span>
                  <span>${data.businessName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span>${data.bookingDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Time:</span>
                  <span>${data.bookingTime}</span>
                </div>
                ${data.cancellationReason ? `
                <div class="detail-row">
                  <span class="detail-label">Reason:</span>
                  <span>${data.cancellationReason}</span>
                </div>` : ''}
                ${data.refundAmount ? `
                <div class="detail-row">
                  <span class="detail-label">Refund Amount:</span>
                  <span>$${data.refundAmount.toFixed(2)}</span>
                </div>` : ''}
              </div>
              
              ${data.refundAmount ? '<p>Your refund will be processed within 3-5 business days.</p>' : ''}
              
              <p>We apologize for any inconvenience. We hope to serve you again soon!</p>
            </div>
            
            <div class="footer">
              <p>&copy; 2024 ${data.businessName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Booking Cancelled - ${data.businessName}
      
      Dear ${data.customerName},
      
      Your reservation has been cancelled:
      
      Restaurant: ${data.businessName}
      Date: ${data.bookingDate}
      Time: ${data.bookingTime}
      ${data.cancellationReason ? `Reason: ${data.cancellationReason}` : ''}
      ${data.refundAmount ? `Refund Amount: $${data.refundAmount.toFixed(2)}` : ''}
      
      ${data.refundAmount ? 'Your refund will be processed within 3-5 business days.' : ''}
      
      We apologize for any inconvenience. We hope to serve you again soon!
    `;

    return { subject, html, text };
  }

  private getWaitlistNotificationTemplate(data: WaitlistNotificationData): EmailTemplate {
    const subject = `Waitlist Update - ${data.businessName}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #f39c12; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .waitlist-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 10px 0; }
            .detail-label { font-weight: bold; }
            .position-badge { background: #f39c12; color: white; padding: 10px; border-radius: 5px; text-align: center; margin: 20px 0; }
            .footer { background: #34495e; color: white; padding: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Waitlist Update</h1>
            </div>
            
            <div class="content">
              <p>Dear ${data.customerName},</p>
              
              <div class="position-badge">
                <h2>You are #${data.position} on the waitlist</h2>
              </div>
              
              <div class="waitlist-details">
                <div class="detail-row">
                  <span class="detail-label">Restaurant:</span>
                  <span>${data.businessName}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Current Position:</span>
                  <span>#${data.position}</span>
                </div>
                ${data.estimatedWaitTime ? `
                <div class="detail-row">
                  <span class="detail-label">Estimated Wait Time:</span>
                  <span>${data.estimatedWaitTime} minutes</span>
                </div>` : ''}
              </div>
              
              <p>We'll notify you when your table is ready. Please stay nearby!</p>
              
              ${data.businessPhone ? `<p>If you have any questions, please call us at ${data.businessPhone}</p>` : ''}
            </div>
            
            <div class="footer">
              <p>&copy; 2024 ${data.businessName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
      Waitlist Update - ${data.businessName}
      
      Dear ${data.customerName},
      
      You are #${data.position} on the waitlist
      
      Restaurant: ${data.businessName}
      Current Position: #${data.position}
      ${data.estimatedWaitTime ? `Estimated Wait Time: ${data.estimatedWaitTime} minutes` : ''}
      
      We'll notify you when your table is ready. Please stay nearby!
      
      ${data.businessPhone ? `If you have any questions, please call us at ${data.businessPhone}` : ''}
    `;

    return { subject, html, text };
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async testConnection(): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      logger.warn('Email service not configured - connection test skipped');
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('Email service connection verified successfully');
      return true;
    } catch (error) {
      logger.error('Email service connection failed:', error);
      return false;
    }
  }
}

export const emailService = new EmailService(); 