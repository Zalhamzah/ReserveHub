"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsService = exports.SMSService = void 0;
const twilio_1 = require("twilio");
const config_1 = require("@/config/config");
const logger_1 = require("@/utils/logger");
class SMSService {
    client;
    fromNumber;
    constructor() {
        this.client = new twilio_1.Twilio(config_1.config.notifications.twilio.accountSid, config_1.config.notifications.twilio.authToken);
        this.fromNumber = config_1.config.notifications.twilio.phoneNumber;
    }
    async sendSMS(data) {
        try {
            const result = await this.client.messages.create({
                body: data.message,
                from: this.fromNumber,
                to: data.to
            });
            logger_1.logger.info(`SMS sent successfully to ${data.to}`, { sid: result.sid });
            return true;
        }
        catch (error) {
            logger_1.logger.error('Error sending SMS:', error);
            return false;
        }
    }
    async sendBookingConfirmation(data) {
        try {
            const message = this.getBookingConfirmationMessage(data);
            return await this.sendSMS({
                to: data.customerPhone,
                message
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending booking confirmation SMS:', error);
            return false;
        }
    }
    async sendBookingReminder(data) {
        try {
            const message = this.getBookingReminderMessage(data);
            return await this.sendSMS({
                to: data.customerPhone,
                message
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending booking reminder SMS:', error);
            return false;
        }
    }
    async sendBookingCancellation(data) {
        try {
            const message = this.getBookingCancellationMessage(data);
            return await this.sendSMS({
                to: data.customerPhone,
                message
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending booking cancellation SMS:', error);
            return false;
        }
    }
    async sendWaitlistNotification(data) {
        try {
            const message = this.getWaitlistNotificationMessage(data);
            return await this.sendSMS({
                to: data.customerPhone,
                message
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending waitlist notification SMS:', error);
            return false;
        }
    }
    async sendTableReadyNotification(data) {
        try {
            const message = this.getTableReadyMessage(data);
            return await this.sendSMS({
                to: data.customerPhone,
                message
            });
        }
        catch (error) {
            logger_1.logger.error('Error sending table ready SMS:', error);
            return false;
        }
    }
    getBookingConfirmationMessage(data) {
        return `Hi ${data.customerName}! Your reservation at ${data.businessName} is confirmed for ${data.bookingDate} at ${data.bookingTime} for ${data.partySize} ${data.partySize === 1 ? 'person' : 'people'}. Confirmation code: ${data.confirmationCode}. See you soon!`;
    }
    getBookingReminderMessage(data) {
        const reminderText = {
            day_before: 'tomorrow',
            hour_before: 'in 1 hour',
            custom: 'soon'
        };
        return `Hi ${data.customerName}! Friendly reminder: Your reservation at ${data.businessName} is ${reminderText[data.reminderType]} (${data.bookingDate} at ${data.bookingTime}). Confirmation code: ${data.confirmationCode}. We look forward to seeing you!`;
    }
    getBookingCancellationMessage(data) {
        let message = `Hi ${data.customerName}, your reservation at ${data.businessName} for ${data.bookingDate} at ${data.bookingTime} has been cancelled.`;
        if (data.cancellationReason) {
            message += ` Reason: ${data.cancellationReason}.`;
        }
        message += ' We apologize for any inconvenience. Hope to serve you again soon!';
        return message;
    }
    getWaitlistNotificationMessage(data) {
        let message = `Hi ${data.customerName}! You're #${data.position} on the waitlist at ${data.businessName}.`;
        if (data.estimatedWaitTime) {
            message += ` Estimated wait time: ${data.estimatedWaitTime} minutes.`;
        }
        message += ' We\'ll notify you when your table is ready. Please stay nearby!';
        return message;
    }
    getTableReadyMessage(data) {
        return `Great news ${data.customerName}! Your table is ready at ${data.businessName}. Please come to the host stand with confirmation code: ${data.confirmationCode}. Thanks for your patience!`;
    }
    formatPhoneNumber(phone) {
        // Remove all non-digit characters
        const cleaned = phone.replace(/\D/g, '');
        // Add country code if missing
        if (cleaned.length === 10) {
            return `+1${cleaned}`;
        }
        else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+${cleaned}`;
        }
        else if (cleaned.startsWith('+')) {
            return phone;
        }
        return phone; // Return as-is if format is unclear
    }
    validatePhoneNumber(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
    }
    async testConnection() {
        try {
            // Test by fetching account info
            const account = await this.client.api.accounts(config_1.config.notifications.twilio.accountSid).fetch();
            logger_1.logger.info('SMS service connection verified successfully', { accountSid: account.sid });
            return true;
        }
        catch (error) {
            logger_1.logger.error('SMS service connection failed:', error);
            return false;
        }
    }
}
exports.SMSService = SMSService;
exports.smsService = new SMSService();
//# sourceMappingURL=smsService.js.map