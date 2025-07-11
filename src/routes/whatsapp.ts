import { Router, Request, Response, NextFunction } from 'express';
import { param, validationResult, body } from 'express-validator';
import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { ValidationError, NotFoundError } from '@/middleware/errorHandler';
import { whatsappService } from '@/services/whatsappService';
import { config } from '@/config/config';
import moment from 'moment-timezone';
import crypto from 'crypto';

const router = Router();

// Webhook verification endpoint (GET)
router.get('/webhook', (req: Request, res: Response) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Check if the mode and token are correct
    if (mode === 'subscribe' && token === config.notifications.whatsapp.webhookVerifyToken) {
      logger.info('WhatsApp webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      logger.warn('WhatsApp webhook verification failed', {
        mode,
        token,
        expectedToken: config.notifications.whatsapp.webhookVerifyToken
      });
      res.status(403).send('Forbidden');
    }
  } catch (error) {
    logger.error('Error in webhook verification:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Webhook for incoming messages (POST)
router.post('/webhook', (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Verify webhook signature
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!verifyWebhookSignature(req.body, signature)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).send('Unauthorized');
    }

    // Check if this is a WhatsApp status update
    if (body.object === 'whatsapp_business_account') {
      body.entry?.forEach((entry: any) => {
        const changes = entry.changes || [];
        changes.forEach((change: any) => {
          if (change.field === 'messages') {
            const messages = change.value.messages || [];
            const statuses = change.value.statuses || [];

            // Process incoming messages
            messages.forEach((message: any) => {
              processIncomingMessage(message, change.value);
            });

            // Process message status updates
            statuses.forEach((status: any) => {
              processMessageStatus(status);
            });
          }
        });
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error processing webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload: any, signature: string): boolean {
  try {
    if (!config.notifications.whatsapp.appSecret) {
      logger.warn('App secret not configured, skipping signature verification');
      return true; // Allow for development
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.notifications.whatsapp.appSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === `sha256=${expectedSignature}`;
  } catch (error) {
    logger.error('Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Process incoming WhatsApp message
 */
async function processIncomingMessage(message: any, value: any): Promise<void> {
  try {
    if (message.type === 'text') {
      await handleTextMessage(message, value);
    } else if (message.type === 'interactive') {
      await handleInteractiveMessage(message, value);
    }
  } catch (error) {
    logger.error('Error processing incoming message:', error);
  }
}

/**
 * Process message status updates
 */
function processMessageStatus(status: any): void {
  logger.info('Message status update:', {
    id: status.id,
    status: status.status,
    timestamp: status.timestamp
  });
}

/**
 * Handle text messages
 */
async function handleTextMessage(message: any, value: any): Promise<void> {
  try {
    const from = message.from;
    const text = message.text.body;
    const messageId = message.id;

    logger.info('Processing text message:', {
      from,
      text,
      messageId
    });

    // Check if this is a response to a booking confirmation
    if (text.toLowerCase().includes('yes') || text.toLowerCase().includes('confirm')) {
      await handleBookingConfirmation(from, text);
    } else if (text.toLowerCase().includes('cancel') || text.toLowerCase().includes('reschedule')) {
      await handleBookingModification(from, text);
    } else {
      // General inquiry - could be handled by customer service
      logger.info('General inquiry received from:', from);
    }
  } catch (error) {
    logger.error('Error handling text message:', error);
  }
}

/**
 * Handle interactive messages (buttons, lists, etc.)
 */
async function handleInteractiveMessage(message: any, value: any): Promise<void> {
  try {
    logger.info('Interactive message received:', message);
  } catch (error) {
    logger.error('Error handling interactive message:', error);
  }
}

/**
 * Handle booking confirmation responses
 */
async function handleBookingConfirmation(from: string, text: string): Promise<void> {
  try {
    // Find recent bookings for this phone number
    const recentBookings = await prisma.booking.findMany({
      where: {
        customer: {
          phone: from
        },
        status: 'CONFIRMED',
        bookingTime: {
          gte: new Date()
        }
      },
      include: {
        customer: true,
        business: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 1
    });

    if (recentBookings.length > 0) {
      const booking = recentBookings[0];
      logger.info('Booking confirmed by customer:', {
        bookingId: booking.id,
        customerPhone: from,
        confirmationCode: booking.confirmationCode
      });

      // You could update booking status or send acknowledgment
      // For now, just log the confirmation
    }
  } catch (error) {
    logger.error('Error handling booking confirmation:', error);
  }
}

/**
 * Handle booking modification requests
 */
async function handleBookingModification(from: string, text: string): Promise<void> {
  try {
    logger.info('Booking modification request from:', from, 'Message:', text);
    // Handle booking modification logic here
  } catch (error) {
    logger.error('Error handling booking modification:', error);
  }
}

// Get service status
router.get('/status', (req: Request, res: Response) => {
  try {
    const status = whatsappService.getStatus();
    res.json({
      success: true,
      data: status,
      message: 'WhatsApp service status retrieved successfully'
    });
  } catch (error) {
    logger.error('Error getting WhatsApp service status:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving service status'
    });
  }
});

// Generate WhatsApp link for booking confirmation
router.get('/booking/:bookingId/link', [
  param('bookingId').isString().notEmpty().withMessage('Booking ID is required')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingId } = req.params;

    // Get booking details
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

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Generate confirmation message
    const message = `🎉 *Booking Confirmed!*

Hi ${booking.customer.firstName} ${booking.customer.lastName}! Your reservation at *${booking.business.name}* is confirmed.

📅 *Date:* ${moment(booking.bookingDate).format('MMMM Do, YYYY')}
🕐 *Time:* ${moment(booking.bookingTime).format('h:mm A')}
👥 *Party Size:* ${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}
🎫 *Confirmation Code:* ${booking.confirmationCode}

We look forward to serving you! Please arrive on time.

*Need to cancel or modify?* Please call us as soon as possible.

Thank you for choosing ${booking.business.name}! 🙏`;

    // Generate WhatsApp link
    const encodedMessage = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/60142779902?text=${encodedMessage}`;

    res.json({
      success: true,
      data: {
        whatsappLink,
        phoneNumber: '60142779902',
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber
      },
      message: 'WhatsApp link generated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Send confirmation message manually
router.post('/send-confirmation', [
  body('bookingId').isString().notEmpty().withMessage('Booking ID is required')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingId } = req.body;

    // Get booking details
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

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Send WhatsApp confirmation
    const bookingData = {
      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      businessName: booking.business.name,
      bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
      bookingTime: moment(booking.bookingTime).format('h:mm A'),
      partySize: booking.partySize,
      confirmationCode: booking.confirmationCode
    };

    const result = await whatsappService.sendBookingConfirmation(bookingData, booking.customer.phone);

    if (result.success) {
      logger.info(`Manual WhatsApp confirmation sent to ${booking.customer.phone} for booking ${booking.bookingNumber}`);
    }

    res.json({
      success: result.success,
      data: {
        messageId: result.messageId,
        whatsappUrl: result.whatsappUrl
      },
      message: result.success ? 'WhatsApp confirmation sent successfully' : 'Failed to send WhatsApp confirmation'
    });

  } catch (error) {
    next(error);
  }
});

// Send confirmation message using booking number (public endpoint)
router.post('/public/send-confirmation', [
  body('bookingNumber').isString().notEmpty().withMessage('Booking number is required'),
  body('phoneNumber').isString().notEmpty().withMessage('Phone number is required')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingNumber, phoneNumber } = req.body;

    // Get booking details using booking number
    const booking = await prisma.booking.findFirst({
      where: { 
        bookingNumber: bookingNumber,
        customer: {
          phone: phoneNumber // Verify phone number matches for security
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

    if (!booking) {
      throw new NotFoundError('Booking not found or phone number does not match');
    }

    // Send WhatsApp confirmation
    const bookingData = {
      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      businessName: booking.business.name,
      bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
      bookingTime: moment(booking.bookingTime).format('h:mm A'),
      partySize: booking.partySize,
      confirmationCode: booking.confirmationCode,
      bookingNumber: booking.bookingNumber
    };

    const result = await whatsappService.sendBookingConfirmation(bookingData, booking.customer.phone);

    if (result.success) {
      logger.info(`Public WhatsApp confirmation sent to ${booking.customer.phone} for booking ${booking.bookingNumber}`);
    }

    res.json({
      success: result.success,
      data: {
        messageId: result.messageId,
        whatsappUrl: result.whatsappUrl,
        phoneNumber: booking.customer.phone,
        bookingNumber: booking.bookingNumber
      },
      message: result.success ? 'WhatsApp confirmation sent successfully' : 'Failed to send WhatsApp confirmation'
    });

  } catch (error) {
    next(error);
  }
});

export default router; 