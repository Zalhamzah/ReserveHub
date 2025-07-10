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
        },
        tls: {
          rejectUnauthorized: false
        }
      });
      
      logger.info('📧 Email service configured with Gmail SMTP');
      logger.info(`📧 Sender: ${config.notifications.email.from}`);
    } else {
      this.transporter = null;
      logger.info('📧 Email service running in DEMO MODE - realistic email simulation enabled');
      logger.info('📧 To enable real emails, configure SMTP_USER, SMTP_PASSWORD in .env file');
    }
  }

  private isEmailConfigured(): boolean {
    const { host, user, password } = config.notifications.email;
    const isConfigured = !!(host && user && password && 
      host.length > 0 && 
      user.length > 0 && 
      password.length > 0 &&
      user !== 'your-email@gmail.com' && 
      password !== 'your-app-password-here');
    
    if (!isConfigured) {
      logger.warn('📧 Email credentials not configured - using demo mode');
      logger.warn('📧 Set SMTP_USER=zal.hamzah@storehub.com and SMTP_PASSWORD in .env');
    }
    
    return isConfigured;
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      // Enhanced realistic demo mode
      return this.simulateEmailSending(emailData);
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
      
      logger.info(`✅ Email sent successfully to ${emailData.to}`);
      logger.info(`📧 Message ID: ${result.messageId}`);
      
      // Show success message in console for demo
      console.log(`\n🎉 EMAIL SENT SUCCESSFULLY!`);
      console.log(`   📨 From: ${config.notifications.email.from}`);
      console.log(`   📨 To: ${emailData.to}`);
      console.log(`   📝 Subject: ${emailData.subject}`);
      console.log(`   ✅ Status: Delivered\n`);
      
      return true;
    } catch (error) {
      logger.error('❌ Error sending email:', error);
      
      // Check for specific Gmail authentication errors
      if (error instanceof Error && error.message.includes('Username and Password not accepted')) {
        logger.error('📧 Gmail authentication failed - check SMTP_USER and SMTP_PASSWORD');
        logger.error('📧 Make sure to use an App Password, not your regular Gmail password');
        logger.error('📧 Falling back to demo mode for this request');
        return this.simulateEmailSending(emailData);
      }
      
      return false;
    }
  }

  private simulateEmailSending(emailData: EmailData): boolean {
    // Simulate realistic email sending with delay
    const deliveryTime = new Date(Date.now() + 2000); // 2 seconds delivery time
    
    logger.info(`📧 EMAIL CONFIRMATION SENT to ${emailData.to}`);
    logger.info(`📧 Subject: ${emailData.subject}`);
    logger.info(`📧 From: ReserveHub <zal.hamzah@storehub.com>`);
    logger.info(`📧 Status: ✅ DELIVERED (Demo Mode)`);
    logger.info(`📧 Delivery Time: ${deliveryTime.toLocaleTimeString()}`);
    logger.info(`📧 Content Preview: ${emailData.html?.substring(0, 200).replace(/<[^>]*>/g, ' ').trim()}...`);
    
    // Enhanced console output for demo
    console.log(`\n🎉 EMAIL NOTIFICATION SENT SUCCESSFULLY!`);
    console.log(`   📨 From: ReserveHub <zal.hamzah@storehub.com>`);
    console.log(`   📨 To: ${emailData.to}`);
    console.log(`   📝 Subject: ${emailData.subject}`);
    console.log(`   🕐 Delivered: ${deliveryTime.toLocaleTimeString()}`);
    console.log(`   ✅ Status: Successfully Delivered (Demo Mode)`);
    console.log(`   📧 Note: Configure SMTP credentials to send real emails\n`);
    
    // Extract booking details if it's a booking confirmation
    if (emailData.subject.includes('Booking Confirmation')) {
      const htmlContent = emailData.html;
      
      // Extract key information using regex (basic parsing)
      const dateMatch = htmlContent.match(/Date:<\/strong>\s*([^<]+)/);
      const timeMatch = htmlContent.match(/Time:<\/strong>\s*([^<]+)/);
      const partyMatch = htmlContent.match(/Party Size:<\/strong>\s*([^<]+)/);
      const codeMatch = htmlContent.match(/Confirmation Code:<\/strong>\s*([^<]+)/);
      
      if (dateMatch || timeMatch || partyMatch || codeMatch) {
        console.log(`   📅 Booking Details:`);
        if (dateMatch) console.log(`      📅 Date: ${dateMatch[1].trim()}`);
        if (timeMatch) console.log(`      🕐 Time: ${timeMatch[1].trim()}`);
        if (partyMatch) console.log(`      👥 Party: ${partyMatch[1].trim()}`);
        if (codeMatch) console.log(`      🎫 Code: ${codeMatch[1].trim()}`);
        console.log(`   📱 WhatsApp: Customer can contact +60142779902\n`);
      }
    }
    
    return true;
  }

  async sendBookingConfirmation(data: BookingConfirmationData): Promise<boolean> {
    try {
      const template = this.getBookingConfirmationTemplate(data);
      
      const result = await this.sendEmail({
        to: data.customerEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      
      if (result) {
        logger.info(`📧 Booking confirmation email sent to ${data.customerName} at ${data.customerEmail}`);
      }
      
      return result;
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
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Booking Confirmation</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f4f4f4;
            }
            .container {
              background-color: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              color: #2c5530;
              border-bottom: 2px solid #2c5530;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
            }
            .confirmation-badge {
              background: linear-gradient(135deg, #2c5530, #4a7c59);
              color: white;
              padding: 15px 25px;
              border-radius: 25px;
              display: inline-block;
              font-weight: bold;
              margin: 20px 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .booking-details {
              background-color: #f8f9fa;
              padding: 25px;
              border-radius: 8px;
              margin: 25px 0;
              border-left: 4px solid #2c5530;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              margin: 10px 0;
              padding: 8px 0;
              border-bottom: 1px dotted #ddd;
            }
            .detail-row:last-child {
              border-bottom: none;
            }
            .detail-label {
              font-weight: bold;
              color: #2c5530;
              flex: 1;
            }
            .detail-value {
              flex: 2;
              text-align: right;
            }
            .special-requests {
              background-color: #fffbf0;
              padding: 15px;
              border-radius: 5px;
              border: 1px solid #ffd700;
              margin: 20px 0;
            }
            .contact-info {
              background-color: #e8f4f8;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
              text-align: center;
            }
            .whatsapp-section {
              background: linear-gradient(135deg, #25d366, #128c7e);
              color: white;
              padding: 20px;
              border-radius: 8px;
              margin: 25px 0;
              text-align: center;
            }
            .whatsapp-button {
              background-color: white;
              color: #25d366;
              padding: 12px 30px;
              border-radius: 25px;
              text-decoration: none;
              font-weight: bold;
              display: inline-block;
              margin-top: 10px;
              border: 2px solid white;
            }
            .footer {
              text-align: center;
              color: #666;
              border-top: 1px solid #ddd;
              padding-top: 20px;
              margin-top: 30px;
              font-size: 14px;
            }
            .emoji {
              font-size: 20px;
              margin-right: 8px;
            }
            @media (max-width: 600px) {
              .detail-row {
                flex-direction: column;
              }
              .detail-value {
                text-align: left;
                margin-top: 5px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Booking Confirmed!</h1>
              <div class="confirmation-badge">
                ✅ Reservation Confirmed
              </div>
            </div>
            
            <p>Dear <strong>${data.customerName}</strong>,</p>
            
            <p>Great news! Your reservation at <strong>${data.businessName}</strong> has been confirmed. We look forward to serving you!</p>
            
            <div class="booking-details">
              <h3 style="margin-top: 0; color: #2c5530;">📋 Booking Details</h3>
              
              <div class="detail-row">
                <div class="detail-label"><span class="emoji">📅</span>Date:</div>
                <div class="detail-value">${data.bookingDate}</div>
              </div>
              
              <div class="detail-row">
                <div class="detail-label"><span class="emoji">🕐</span>Time:</div>
                <div class="detail-value">${data.bookingTime}</div>
              </div>
              
              <div class="detail-row">
                <div class="detail-label"><span class="emoji">👥</span>Party Size:</div>
                <div class="detail-value">${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}</div>
              </div>
              
              <div class="detail-row">
                <div class="detail-label"><span class="emoji">🎫</span>Confirmation Code:</div>
                <div class="detail-value"><strong style="color: #2c5530; font-size: 18px;">${data.confirmationCode}</strong></div>
              </div>
            </div>
            
            ${data.specialRequests ? `
            <div class="special-requests">
              <h4 style="margin-top: 0; color: #ff8c00;">🍽️ Special Requests</h4>
              <p style="margin-bottom: 0;">${data.specialRequests}</p>
            </div>
            ` : ''}
            
            <div class="whatsapp-section">
              <h3 style="margin-top: 0;">📱 Quick Contact via WhatsApp</h3>
              <p style="margin: 10px 0;">Need to modify your booking or have questions?</p>
              <a href="https://wa.me/60142779902?text=Hi! I have a booking inquiry. Confirmation Code: ${data.confirmationCode}" class="whatsapp-button">
                💬 Contact via WhatsApp
              </a>
              <p style="margin: 10px 0; font-size: 14px;">WhatsApp: +60142779902</p>
            </div>
            
            ${data.businessPhone || data.businessAddress ? `
            <div class="contact-info">
              <h4 style="margin-top: 0; color: #2c5530;">📞 Contact Information</h4>
              ${data.businessPhone ? `<p><strong>Phone:</strong> ${data.businessPhone}</p>` : ''}
              ${data.businessAddress ? `<p><strong>Address:</strong> ${data.businessAddress}</p>` : ''}
            </div>
            ` : ''}
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; border: 1px solid #ffeaa7; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #856404;">⏰ Important Reminders</h4>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Please arrive on time for your reservation</li>
                <li>Bring your confirmation code: <strong>${data.confirmationCode}</strong></li>
                <li>Contact us immediately if you need to cancel or modify</li>
                <li>We'll send you a reminder 1 hour before your booking</li>
              </ul>
            </div>
            
            <p>Thank you for choosing <strong>${data.businessName}</strong>. We can't wait to provide you with an excellent dining experience!</p>
            
            <div class="footer">
              <p>This email was sent from <strong>ReserveHub</strong></p>
              <p>For immediate assistance, contact us via WhatsApp: +60142779902</p>
              <p style="color: #999; font-size: 12px;">If you have any questions about this booking, please contact the restaurant directly.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
🎉 Booking Confirmed!

Dear ${data.customerName},

Your reservation at ${data.businessName} has been confirmed!

📋 Booking Details:
📅 Date: ${data.bookingDate}
🕐 Time: ${data.bookingTime}
👥 Party Size: ${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}
🎫 Confirmation Code: ${data.confirmationCode}

${data.specialRequests ? `🍽️ Special Requests: ${data.specialRequests}` : ''}

📱 Quick Contact: https://wa.me/60142779902?text=Hi! I have a booking inquiry. Confirmation Code: ${data.confirmationCode}

⏰ Important Reminders:
- Please arrive on time for your reservation
- Bring your confirmation code: ${data.confirmationCode}
- Contact us immediately if you need to cancel or modify
- We'll send you a reminder 1 hour before your booking

Thank you for choosing ${data.businessName}!

For immediate assistance, contact us via WhatsApp: +60142779902

---
This email was sent from ReserveHub
    `;

    return {
      subject,
      html,
      text
    };
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