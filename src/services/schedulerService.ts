import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { whatsappService } from './whatsappService';
import moment from 'moment-timezone';

interface ReminderTask {
  bookingId: string;
  scheduledTime: Date;
  type: 'hour_before' | 'day_before';
}

export class SchedulerService {
  private reminderTasks: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.initializeExistingBookings();
  }

  /**
   * Initialize reminders for existing bookings on server start
   */
  private async initializeExistingBookings(): Promise<void> {
    try {
      // Get all confirmed bookings that are in the future
      const futureBookings = await prisma.booking.findMany({
        where: {
          status: 'CONFIRMED',
          bookingTime: {
            gt: new Date()
          }
        },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          business: {
            select: {
              name: true
            }
          }
        }
      });

      // Schedule reminders for each booking
      for (const booking of futureBookings) {
        this.scheduleBookingReminder(booking);
      }

      logger.info(`Initialized ${futureBookings.length} booking reminders`);
    } catch (error) {
      logger.error('Failed to initialize existing booking reminders:', error);
    }
  }

  /**
   * Schedule a reminder for a specific booking
   */
  scheduleBookingReminder(booking: any): void {
    const bookingTime = moment(booking.bookingTime);
    const now = moment();
    
    // Calculate 1 hour before the appointment
    const reminderTime = bookingTime.clone().subtract(1, 'hour');
    
    // Only schedule if reminder time is in the future
    if (reminderTime.isAfter(now)) {
      const timeUntilReminder = reminderTime.diff(now);
      
      const timeoutId = setTimeout(async () => {
        await this.sendBookingReminder(booking);
        this.reminderTasks.delete(booking.id);
      }, timeUntilReminder);

      // Store the timeout ID to cancel later if needed
      this.reminderTasks.set(booking.id, timeoutId);
      
      logger.info(`Scheduled reminder for booking ${booking.bookingNumber} at ${reminderTime.format()}`);
    }
  }

  /**
   * Cancel a scheduled reminder
   */
  cancelBookingReminder(bookingId: string): void {
    const timeoutId = this.reminderTasks.get(bookingId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.reminderTasks.delete(bookingId);
      logger.info(`Cancelled reminder for booking ${bookingId}`);
    }
  }

  /**
   * Send the actual reminder message
   */
  private async sendBookingReminder(booking: any): Promise<void> {
    try {
      // Fetch the latest booking data to ensure it's still valid
      const currentBooking = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          business: {
            select: {
              name: true
            }
          }
        }
      });

      if (!currentBooking || currentBooking.status !== 'CONFIRMED') {
        logger.info(`Skipping reminder for booking ${booking.bookingNumber} - booking no longer valid`);
        return;
      }

      // Check if customer has a phone number
      if (!currentBooking.customer.phone) {
        logger.warn(`Skipping WhatsApp reminder for booking ${currentBooking.bookingNumber} - no phone number available`);
        return;
      }

      // Send WhatsApp reminder using the enhanced WhatsApp service
      const reminderData = {
        customerName: `${currentBooking.customer.firstName} ${currentBooking.customer.lastName}`,
        businessName: currentBooking.business.name,
        bookingDate: moment(currentBooking.bookingDate).format('MMMM Do, YYYY'),
        bookingTime: moment(currentBooking.bookingTime).format('h:mm A'),
        confirmationCode: currentBooking.confirmationCode,
        reminderType: 'hour_before' as const,
        serviceType: undefined, // Will be set for salon bookings
        staffName: undefined    // Will be set for salon bookings
      };

      const messageResult = await whatsappService.sendReminderMessage(reminderData, currentBooking.customer.phone);
      
      if (messageResult.success) {
        logger.info(`WhatsApp reminder sent successfully for booking ${currentBooking.bookingNumber} to ${currentBooking.customer.phone}`);
      } else {
        logger.warn(`Failed to send WhatsApp reminder for booking ${currentBooking.bookingNumber}: ${messageResult.error}`);
      }

    } catch (error) {
      logger.error(`Failed to send reminder for booking ${booking.bookingNumber}:`, error);
    }
  }

  /**
   * Update booking reminder when booking is modified
   */
  updateBookingReminder(bookingId: string, newBookingTime: Date): void {
    // Cancel existing reminder
    this.cancelBookingReminder(bookingId);

    // Schedule new reminder if booking is in the future
    if (moment(newBookingTime).isAfter(moment())) {
      // We need to fetch the booking data to schedule the new reminder
      this.fetchAndScheduleBooking(bookingId);
    }
  }

  /**
   * Fetch booking data and schedule reminder
   */
  private async fetchAndScheduleBooking(bookingId: string): Promise<void> {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true
            }
          },
          business: {
            select: {
              name: true
            }
          }
        }
      });

      if (booking && booking.status === 'CONFIRMED') {
        this.scheduleBookingReminder(booking);
      }
    } catch (error) {
      logger.error(`Failed to fetch and schedule booking ${bookingId}:`, error);
    }
  }

  /**
   * Get status of scheduled reminders
   */
  getScheduledReminders(): { bookingId: string; count: number }[] {
    return Array.from(this.reminderTasks.keys()).map(bookingId => ({
      bookingId,
      count: 1
    }));
  }

  /**
   * Cleanup method to cancel all reminders
   */
  cleanup(): void {
    for (const [bookingId, timeoutId] of this.reminderTasks.entries()) {
      clearTimeout(timeoutId);
    }
    this.reminderTasks.clear();
    logger.info('Cleaned up all scheduled reminders');
  }
}

export const schedulerService = new SchedulerService(); 