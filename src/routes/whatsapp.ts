import { Router, Request, Response, NextFunction } from 'express';
import { param, validationResult } from 'express-validator';
import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { ValidationError, NotFoundError } from '@/middleware/errorHandler';
import { whatsappService } from '@/services/whatsappService';
import moment from 'moment-timezone';

const router = Router();

// Get WhatsApp configuration
router.get('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: {
        phoneNumber: whatsappService.getFormattedPhoneNumber(),
        businessName: whatsappService.getBusinessName(),
        rawPhoneNumber: whatsappService.getPhoneNumber()
      },
      message: 'WhatsApp configuration retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Generate WhatsApp QR code for booking confirmation
router.get('/booking/:bookingId/qr', [
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

    // Generate QR code
    const qrCodeDataURL = await whatsappService.generateConfirmationQR({
      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      businessName: booking.business.name,
      bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
      bookingTime: moment(booking.bookingTime).format('h:mm A'),
      partySize: booking.partySize,
      confirmationCode: booking.confirmationCode,
      serviceType: undefined, // Will be set for salon bookings
      staffName: undefined    // Will be set for salon bookings
    });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataURL,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber
      },
      message: 'QR code generated successfully'
    });

  } catch (error) {
    next(error);
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

    // Generate WhatsApp link
    const whatsappLink = whatsappService.generateConfirmationLink({
      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      businessName: booking.business.name,
      bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
      bookingTime: moment(booking.bookingTime).format('h:mm A'),
      partySize: booking.partySize,
      confirmationCode: booking.confirmationCode,
      serviceType: undefined, // Will be set for salon bookings
      staffName: undefined    // Will be set for salon bookings
    });

    res.json({
      success: true,
      data: {
        whatsappLink,
        phoneNumber: whatsappService.getPhoneNumber(),
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber
      },
      message: 'WhatsApp link generated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Generate general contact QR code
router.get('/contact/qr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const qrCodeDataURL = await whatsappService.generateContactQR();

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataURL,
        phoneNumber: whatsappService.getFormattedPhoneNumber(),
        businessName: whatsappService.getBusinessName(),
        whatsappLink: `https://wa.me/${whatsappService.getPhoneNumber()}`
      },
      message: 'Contact QR code generated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Generate contact QR code with custom message
router.post('/contact/qr', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    const phoneNumber = whatsappService.getPhoneNumber();
    
    let whatsappLink = `https://wa.me/${phoneNumber}`;
    if (message) {
      whatsappLink += `?text=${encodeURIComponent(message)}`;
    }
    
    // Import QRCode here to avoid any issues
    const QRCode = require('qrcode');
    const qrCodeDataURL = await QRCode.toDataURL(whatsappLink, {
      width: 300,
      margin: 2,
      color: {
        dark: '#25D366', // WhatsApp green
        light: '#FFFFFF'
      }
    });
    
    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataURL,
        phoneNumber: whatsappService.getFormattedPhoneNumber(),
        businessName: whatsappService.getBusinessName(),
        whatsappLink
      },
      message: 'Custom message QR code generated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get WhatsApp contact link
router.get('/contact/link', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const phoneNumber = whatsappService.getPhoneNumber();
    const contactLink = `https://wa.me/${phoneNumber}`;

    res.json({
      success: true,
      data: {
        whatsappLink: contactLink,
        phoneNumber: whatsappService.getFormattedPhoneNumber(),
        businessName: whatsappService.getBusinessName()
      },
      message: 'Contact link generated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Generate WhatsApp reminder QR code for a booking
router.get('/booking/:bookingId/reminder/qr', [
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

    // Generate reminder QR code
    const qrCodeDataURL = await whatsappService.generateReminderQR({
      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      businessName: booking.business.name,
      bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
      bookingTime: moment(booking.bookingTime).format('h:mm A'),
      confirmationCode: booking.confirmationCode,
      reminderType: 'hour_before',
      serviceType: undefined, // Will be set for salon bookings
      staffName: undefined    // Will be set for salon bookings
    });

    res.json({
      success: true,
      data: {
        qrCode: qrCodeDataURL,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber
      },
      message: 'Reminder QR code generated successfully'
    });

  } catch (error) {
    next(error);
  }
});

export default router; 