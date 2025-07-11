import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult, param, query } from 'express-validator';
import { prisma, checkDatabaseConnection } from '@/utils/database';
import { logger } from '@/utils/logger';
import { authMiddleware, requireRole, requireBusinessAccess } from '@/middleware/auth';
import { ValidationError, NotFoundError, ConflictError } from '@/middleware/errorHandler';
import { availabilityService } from '@/services/availabilityService';
import { realTimeAvailabilityService } from '@/services/realTimeAvailabilityService';
import { websocketEvents } from '@/utils/websocket';
import moment from 'moment-timezone';
import { v4 as uuidv4 } from 'uuid';
import { emailService } from '@/services/emailService';
import { smsService } from '@/services/smsService';
import { schedulerService } from '@/services/schedulerService';
import { whatsappService } from '@/services/whatsappService';

const router = Router();

// Helper functions
const generateBookingNumber = (): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `BK${timestamp}${random}`;
};

const generateConfirmationCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Get bookings by business ID (public endpoint for demo dashboard)
router.get('/business/:businessId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { businessId } = req.params;
    const { limit, sort, status } = req.query;

    // Build query conditions
    const where: any = { businessId };
    if (status) {
      where.status = status as string;
    }

    // Parse limit
    const limitValue = limit ? parseInt(limit as string, 10) : undefined;

    // Parse sort
    let orderBy: any = { createdAt: 'desc' };
    if (sort) {
      const sortStr = sort as string;
      if (sortStr.includes(':')) {
        const [field, direction] = sortStr.split(':');
        orderBy = { [field]: direction };
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
      take: limitValue,
      orderBy,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        bookings,
        total: bookings.length
      },
      message: 'Bookings retrieved successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Public endpoint for customer reservations (no auth required)
const publicBookingValidation = [
  body('firstName').isString().isLength({ min: 1, max: 50 }).withMessage('First name is required and must be 1-50 characters'),
  body('lastName').optional().isString().isLength({ min: 0, max: 50 }).withMessage('Last name must be 0-50 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').isString().matches(/^\+?[\d\s\-\(\)]+$/).withMessage('Valid phone number is required'),
  body('businessId').isString().notEmpty().withMessage('Business ID is required'),
  body('locationId').optional().isString().withMessage('Location ID must be a string'),
  body('serviceId').optional().isString().withMessage('Service ID must be a string'),
  body('bookingDate').isISO8601().withMessage('Valid booking date is required'),
  body('bookingTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
  body('partySize').isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  body('specialRequests').optional().isString().withMessage('Special requests must be a string'),
  // Pet-specific fields
  body('petName').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Pet name must be 1-50 characters'),
  body('petType').optional().isString().isLength({ min: 1, max: 30 }).withMessage('Pet type must be 1-30 characters'),
  body('petBreed').optional().isString().isLength({ min: 1, max: 50 }).withMessage('Pet breed must be 1-50 characters'),
  body('petAge').optional().isString().isLength({ min: 1, max: 20 }).withMessage('Pet age must be 1-20 characters'),
  body('petWeight').optional().isString().isLength({ min: 1, max: 20 }).withMessage('Pet weight must be 1-20 characters'),
  body('petSpecialNeeds').optional().isString().isLength({ max: 500 }).withMessage('Pet special needs must be less than 500 characters'),
  body('vaccinationUpToDate').optional().isBoolean().withMessage('Vaccination status must be true or false'),
  body('lastVetVisit').optional().isISO8601().withMessage('Last vet visit must be a valid date')
];

// Public endpoint - Get available time slots for a date
router.get('/public/availability', [
  query('businessId').isString().notEmpty().withMessage('Business ID is required'),
  query('date').isISO8601().withMessage('Valid date is required'),
  query('partySize').isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  query('locationId').optional().isString().withMessage('Location ID must be a string')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { businessId, date, partySize, locationId } = req.query;

    // Check database connection first
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbError) {
      logger.error('Database connection error in availability endpoint:', dbError);
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again in a moment.',
        error: 'DATABASE_CONNECTION_ERROR'
      });
    }

    // Verify business exists and is active
    let business;
    try {
      business = await prisma.business.findFirst({
        where: {
          id: businessId as string,
          isActive: true
        }
      });
    } catch (dbError) {
      logger.error('Database error when finding business:', dbError);
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again in a moment.',
        error: 'DATABASE_QUERY_ERROR'
      });
    }

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or inactive',
        error: 'BUSINESS_NOT_FOUND'
      });
    }

    // Get available time slots for the date
    let availableSlots;
    try {
      availableSlots = await availabilityService.getAvailableSlots({
        businessId: businessId as string,
        locationId: locationId as string,
        date: date as string,
        partySize: parseInt(partySize as string)
      });
    } catch (availabilityError) {
      logger.error('Error getting available slots:', availabilityError);
      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve available time slots. Please try again.',
        error: 'AVAILABILITY_SERVICE_ERROR'
      });
    }

    res.json({
      success: true,
      data: {
        date,
        partySize: parseInt(partySize as string),
        availableSlots,
        business: {
          id: business.id,
          name: business.name,
          timezone: business.timezone
        }
      }
    });

  } catch (error) {
    logger.error('Unexpected error in availability endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again.',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Public endpoint - Create booking without authentication
router.post('/public/reserve', publicBookingValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    // Check database connection first
    const dbCheck = await checkDatabaseConnection();
    if (!dbCheck.success) {
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again in a moment.',
        error: 'DATABASE_CONNECTION_ERROR'
      });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      businessId,
      locationId,
      serviceId,
      bookingDate,
      bookingTime,
      partySize,
      specialRequests,
      // Pet-specific fields
      petName,
      petType,
      petBreed,
      petAge,
      petWeight,
      petSpecialNeeds,
      vaccinationUpToDate,
      lastVetVisit
    } = req.body;

    // Verify business exists and is active
    let business;
    try {
      business = await prisma.business.findFirst({
        where: {
          id: businessId,
          isActive: true
        }
      });
    } catch (dbError) {
      logger.error('Database error when finding business:', dbError);
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again in a moment.',
        error: 'DATABASE_QUERY_ERROR'
      });
    }

    if (!business) {
      return res.status(404).json({
        success: false,
        message: 'Business not found or inactive',
        error: 'BUSINESS_NOT_FOUND'
      });
    }

    // 🔥 BULLETPROOF CUSTOMER CREATION - ALWAYS WORKS
    let customer;
    try {
      // Step 1: Try to find existing customer by email
      customer = await prisma.customer.findFirst({
        where: { email, businessId }
      });

      if (customer) {
        // Customer exists - update their info and continue
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: { firstName, lastName, phone, isActive: true }
        });
        logger.info(`✅ Using existing customer: ${customer.firstName} ${customer.lastName}`);
      } else {
        // Step 2: Try to find by phone
        const phoneCustomer = await prisma.customer.findFirst({
          where: { phone, businessId }
        });

        if (phoneCustomer) {
          // Phone exists - update email and continue
          customer = await prisma.customer.update({
            where: { id: phoneCustomer.id },
            data: { firstName, lastName, email, isActive: true }
          });
          logger.info(`✅ Updated existing customer via phone: ${customer.firstName} ${customer.lastName}`);
        } else {
          // Step 3: Create new customer
          try {
            customer = await prisma.customer.create({
              data: {
                firstName,
                lastName,
                email,
                phone,
                businessId,
                vipStatus: 'REGULAR',
                totalVisits: 0,
                totalSpent: 0,
                averageSpent: 0,
                isActive: true
              }
            });
            logger.info(`✅ Created new customer: ${customer.firstName} ${customer.lastName}`);
          } catch (createError: any) {
            // If creation fails, find any existing customer and use that
            customer = await prisma.customer.findFirst({
              where: {
                OR: [
                  { email, businessId },
                  { phone, businessId }
                ]
              }
            });
            
            if (!customer) {
              // Last resort: create customer with modified email/phone
              const timestamp = Date.now();
              customer = await prisma.customer.create({
                data: {
                  firstName,
                  lastName,
                  email: `${email.split('@')[0]}+${timestamp}@${email.split('@')[1]}`,
                  phone: phone + timestamp.toString().slice(-3),
                  businessId,
                  vipStatus: 'REGULAR',
                  totalVisits: 0,
                  totalSpent: 0,
                  averageSpent: 0,
                  isActive: true
                }
              });
            }
            logger.info(`✅ Fallback customer creation: ${customer.firstName} ${customer.lastName}`);
          }
        }
      }
    } catch (error) {
      logger.error('❌ Customer creation failed completely:', error);
      throw new Error('Unable to process customer information');
    }

    // Verify location belongs to business (if provided)
    if (locationId) {
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          businessId,
          isActive: true
        }
      });

      if (!location) {
        throw new NotFoundError('Location not found');
      }
    }

    // Verify service exists and belongs to business (if provided)
    let service = null;
    let serviceDuration = 90; // Default duration
    if (serviceId) {
      service = await prisma.service.findFirst({
        where: {
          id: serviceId,
          businessId,
          isActive: true
        }
      });

      if (!service) {
        throw new NotFoundError('Service not found or inactive');
      }

      // Use service duration if available
      serviceDuration = service.duration || 90;
    }

    // Get a system user for createdBy (use first admin/manager user)
    const systemUser = await prisma.user.findFirst({
      where: {
        businessId,
        role: { in: ['ADMIN', 'MANAGER'] },
        isActive: true
      }
    });

    if (!systemUser) {
      throw new NotFoundError('No system user found for business');
    }

    // Combine date and time
    const bookingDateTime = moment(`${bookingDate} ${bookingTime}`).toISOString();

    // Check availability and reserve slot
    const reservationResult = await availabilityService.reserveSlot(
      businessId,
      locationId,
      bookingDateTime,
      partySize,
      serviceDuration, // Use service duration instead of default
      customer.id
    );

    if (!reservationResult.success) {
      throw new ConflictError('Time slot not available');
    }

    // Prepare pet information for metadata
    const petInfo = petName ? {
      petName,
      petType,
      petBreed,
      petAge,
      petWeight,
      petSpecialNeeds,
      vaccinationUpToDate,
      lastVetVisit: lastVetVisit ? new Date(lastVetVisit) : undefined
    } : undefined;

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        bookingNumber: generateBookingNumber(),
        customerId: customer.id,
        businessId,
        locationId,
        serviceId: serviceId || undefined,
        tableId: reservationResult.tableId,
        bookingDate: moment(bookingDate).toDate(),
        bookingTime: moment(bookingDateTime).toDate(),
        duration: serviceDuration,
        partySize,
        status: 'PENDING',
        confirmationCode: generateConfirmationCode(),
        specialRequests,
        source: 'ONLINE',
        createdById: systemUser.id,
        metadata: petInfo ? { petInfo } : undefined
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        service: service ? {
          select: {
            id: true,
            name: true,
            description: true,
            duration: true,
            price: true,
            category: true
          }
        } : undefined,
        table: {
          select: {
            id: true,
            number: true,
            capacity: true
          }
        },
        location: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      }
    });

    // Notify real-time availability change
    await realTimeAvailabilityService.notifyBookingCreated(
      businessId,
      locationId,
      bookingDateTime,
      partySize,
      serviceDuration
    );

    // Emit WebSocket event
    websocketEvents.bookingCreated(businessId, booking);

    // Generate WhatsApp QR code and link for booking confirmation
    let whatsappData = null;
    try {
      const bookingData = {
        customerName: `${customer.firstName} ${customer.lastName}`,
        businessName: business.name,
        bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
        bookingTime: moment(booking.bookingTime).format('h:mm A'),
        partySize: booking.partySize,
        confirmationCode: booking.confirmationCode,
        serviceType: undefined, // Will be set for salon bookings
        staffName: undefined    // Will be set for salon bookings
      };

      // Generate WhatsApp link and QR code
      const confirmationMessage = `🎉 *Booking Confirmed!*

Hi ${bookingData.customerName}! Your reservation at *${bookingData.businessName}* is confirmed.

📅 *Date:* ${bookingData.bookingDate}
🕐 *Time:* ${bookingData.bookingTime}
👥 *Party Size:* ${bookingData.partySize} ${bookingData.partySize === 1 ? 'person' : 'people'}
🎫 *Confirmation Code:* ${bookingData.confirmationCode}

We look forward to serving you! Please arrive on time.

*Need to cancel or modify?* Please call us as soon as possible.

Thank you for choosing ${bookingData.businessName}! 🙏`;

      const whatsappLink = `https://wa.me/60142779902?text=${encodeURIComponent(confirmationMessage)}`;
      const qrCode = await whatsappService.generateQRCode('60142779902', confirmationMessage);

      whatsappData = {
        link: whatsappLink,
        qrCode: qrCode,
        phoneNumber: '60142779902'
      };

      // Send WhatsApp confirmation message directly to customer
      if (customer.phone) {
        try {
          logger.info(`Queued WhatsApp confirmation message for ${customer.firstName} ${customer.lastName} at ${customer.phone}`);
          const messageResult = await whatsappService.sendBookingConfirmation(bookingData, customer.phone);
          if (messageResult.success) {
            logger.info(`WhatsApp confirmation message sent to ${customer.firstName} ${customer.lastName} at +${customer.phone}`);
            whatsappData.messageSent = true;
            whatsappData.messageId = messageResult.messageId;
            whatsappData.whatsappUrl = messageResult.whatsappUrl;
          } else {
            logger.warn(`Failed to send WhatsApp confirmation message to ${customer.phone}`);
            whatsappData.messageSent = false;
            whatsappData.messageError = 'Failed to send confirmation message';
          }
        } catch (error) {
          logger.error('Error sending WhatsApp confirmation message:', error);
          whatsappData.messageSent = false;
          whatsappData.messageError = 'Failed to send confirmation message';
        }
      } else {
        logger.warn(`No phone number available for customer ${customer.firstName} ${customer.lastName}, skipping WhatsApp confirmation`);
        whatsappData.messageSent = false;
        whatsappData.messageError = 'No phone number available';
      }
    } catch (error) {
      logger.warn('Failed to generate WhatsApp QR code and link:', error);
    }

    // Send email confirmation
    let emailSent = false;
    try {
      const emailResult = await emailService.sendBookingConfirmation({
        customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
        customerEmail: customer.email!,
        businessName: business.name,
        confirmationCode: booking.confirmationCode,
        bookingDate: moment(booking.bookingDate).format('MMMM Do, YYYY'),
        bookingTime: moment(booking.bookingTime).format('h:mm A'),
        partySize: booking.partySize,
        specialRequests: booking.specialRequests || undefined,
        businessPhone: business.phone || undefined,
        businessAddress: business.address || undefined
      });
      
      if (emailResult) {
        emailSent = true;
        logger.info(`Email confirmation sent to ${customer.email} for booking ${booking.bookingNumber}`);
      } else {
        logger.warn(`Failed to send email confirmation to ${customer.email} for booking ${booking.bookingNumber}`);
      }
    } catch (error) {
      logger.error('Error sending email confirmation:', error);
    }

    // Schedule WhatsApp reminder for 1 hour before appointment
    try {
      // Update booking status to CONFIRMED first
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'CONFIRMED' }
      });

      // Schedule the reminder with complete booking data
      const bookingWithRelations = await prisma.booking.findUnique({
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

      if (bookingWithRelations) {
        schedulerService.scheduleBookingReminder(bookingWithRelations);
      }
    } catch (error) {
      logger.warn('Failed to schedule WhatsApp reminder:', error);
    }

    logger.info(`Public booking created: ${booking.bookingNumber} for customer ${customer.firstName} ${customer.lastName}`);

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      data: {
        booking: {
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          confirmationCode: booking.confirmationCode,
          customer: booking.customer,
          table: booking.table,
          location: booking.location,
          bookingDate: booking.bookingDate,
          bookingTime: booking.bookingTime,
          duration: booking.duration,
          partySize: booking.partySize,
          status: booking.status,
          specialRequests: booking.specialRequests,
          createdAt: booking.createdAt
        },
        whatsapp: whatsappData,
        email: {
          sent: emailSent,
          recipient: customer.email
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

// Validation middleware
const createBookingValidation = [
  body('customerId').isString().notEmpty().withMessage('Customer ID is required'),
  body('locationId').optional().isString().withMessage('Location ID must be a string'),
  body('bookingDate').isISO8601().withMessage('Valid booking date is required'),
  body('bookingTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
  body('partySize').isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  body('duration').optional().isInt({ min: 30, max: 480 }).withMessage('Duration must be between 30 and 480 minutes'),
  body('specialRequests').optional().isString().withMessage('Special requests must be a string'),
  body('tableId').optional().isString().withMessage('Table ID must be a string')
];

const updateBookingValidation = [
  param('bookingId').isString().notEmpty().withMessage('Booking ID is required'),
  body('bookingDate').optional().isISO8601().withMessage('Valid booking date is required'),
  body('bookingTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
  body('partySize').optional().isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  body('duration').optional().isInt({ min: 30, max: 480 }).withMessage('Duration must be between 30 and 480 minutes'),
  body('specialRequests').optional().isString().withMessage('Special requests must be a string'),
  body('tableId').optional().isString().withMessage('Table ID must be a string')
];

const bookingQueryValidation = [
  query('date').optional().isISO8601().withMessage('Valid date is required'),
  query('status').optional().isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
  query('locationId').optional().isString().withMessage('Location ID must be a string'),
  query('customerId').optional().isString().withMessage('Customer ID must be a string'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];

// Create new booking
router.post('/', authMiddleware, requireRole('ADMIN', 'MANAGER', 'STAFF', 'HOST'), createBookingValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const {
      customerId,
      locationId,
      bookingDate,
      bookingTime,
      partySize,
      duration = 90,
      specialRequests,
      tableId
    } = req.body;

    // Verify customer exists and belongs to business
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: req.user!.businessId
      }
    });

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Verify location belongs to business (if provided)
    if (locationId) {
      const location = await prisma.location.findFirst({
        where: {
          id: locationId,
          businessId: req.user!.businessId,
          isActive: true
        }
      });

      if (!location) {
        throw new NotFoundError('Location not found');
      }
    }

    // Combine date and time
    const bookingDateTime = moment(`${bookingDate} ${bookingTime}`).toISOString();

    // Check availability and reserve slot
    const reservationResult = await availabilityService.reserveSlot(
      req.user!.businessId,
      locationId,
      bookingDateTime,
      partySize,
      duration,
      customerId
    );

    if (!reservationResult.success) {
              throw new ConflictError('Time slot not available');
    }

    const finalTableId = tableId || reservationResult.tableId;

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        bookingNumber: generateBookingNumber(),
        customerId,
        businessId: req.user!.businessId,
        locationId,
        tableId: finalTableId,
        bookingDate: moment(bookingDate).toDate(),
        bookingTime: moment(bookingDateTime).toDate(),
        duration,
        partySize,
        status: 'PENDING',
        confirmationCode: generateConfirmationCode(),
        specialRequests,
        source: 'DIRECT',
        createdById: req.user!.id
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        table: {
          select: {
            id: true,
            number: true,
            capacity: true,
            type: true
          }
        },
        location: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      }
    });

    // Notify real-time availability change
    await realTimeAvailabilityService.notifyBookingCreated(
      req.user!.businessId,
      locationId,
      bookingDateTime,
      partySize,
      duration
    );

    // Emit WebSocket event
    websocketEvents.bookingCreated(req.user!.businessId, booking);

    logger.info(`Booking created: ${booking.bookingNumber} for customer ${customer.firstName} ${customer.lastName}`);

    res.status(201).json({
      message: 'Booking created successfully',
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        confirmationCode: booking.confirmationCode,
        customer: booking.customer,
        table: booking.table,
        location: booking.location,
        bookingDate: booking.bookingDate,
        bookingTime: booking.bookingTime,
        duration: booking.duration,
        partySize: booking.partySize,
        status: booking.status,
        specialRequests: booking.specialRequests,
        createdAt: booking.createdAt
      }
    });

  } catch (error) {
    next(error);
  }
});

// Admin endpoint: Get all bookings with pagination and filtering
router.get('/', async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            status, 
            businessId,
            startDate, 
            endDate,
            sort = 'createdAt:desc'
        } = req.query;

        const skip = (Number(page) - 1) * Number(limit);
        const [sortField, sortOrder] = (sort as string).split(':');

        const where: any = {};
        
        if (businessId) {
            where.businessId = businessId as string;
        }
        
        if (status) {
            where.status = status as string;
        }
        
        if (startDate || endDate) {
            where.bookingTime = {};
            if (startDate) {
                where.bookingTime.gte = new Date(startDate as string);
            }
            if (endDate) {
                where.bookingTime.lte = new Date(endDate as string);
            }
        }

        const [bookings, total] = await Promise.all([
            prisma.booking.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: {
                    [sortField]: sortOrder === 'desc' ? 'desc' : 'asc'
                },
                include: {
                    customer: true,
                    business: {
                        select: {
                            name: true,
                            businessType: true
                        }
                    },
                    table: {
                        select: {
                            number: true,
                            capacity: true
                        }
                    }
                }
            }),
            prisma.booking.count({ where })
        ]);

        res.json({
            success: true,
            data: {
                bookings,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching bookings:', error);
        next(error);
    }
});

// Admin endpoint: Update booking status
router.patch('/:id/status', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'confirmed', 'cancelled', 'completed', 'no_show'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const booking = await prisma.booking.update({
            where: { id },
            data: { 
                status,
                updatedAt: new Date()
            },
            include: {
                customer: true,
                business: true,
                table: true
            }
        });

        // Send notification to customer about status change
        if (status === 'confirmed') {
            const bookingData = {
                customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
                customerEmail: booking.customer.email || '',
                businessName: booking.business.name,
                bookingDate: booking.bookingDate.toISOString().split('T')[0],
                bookingTime: booking.bookingTime.toLocaleTimeString(),
                partySize: booking.partySize,
                confirmationCode: booking.confirmationCode,
                tableNumber: booking.table?.number || '',
                specialRequests: booking.specialRequests || ''
            };
            await emailService.sendBookingConfirmation(bookingData);
        } else if (status === 'cancelled') {
            const cancellationData = {
                customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
                customerEmail: booking.customer.email || '',
                businessName: booking.business.name,
                bookingDate: booking.bookingDate.toISOString().split('T')[0],
                bookingTime: booking.bookingTime.toLocaleTimeString(),
                partySize: booking.partySize,
                confirmationCode: booking.confirmationCode,
                reason: booking.cancelledReason || 'Booking cancelled'
            };
            await emailService.sendBookingCancellation(cancellationData);
        }

        logger.info(`Booking ${id} status updated to ${status}`);

        res.json({
            success: true,
            data: { booking },
            message: `Booking ${status} successfully`
        });

    } catch (error) {
        logger.error('Error updating booking status:', error);
        next(error);
    }
});

// Admin endpoint: Get booking statistics for dashboard
router.get('/admin/stats', async (req, res, next) => {
    try {
        const { businessId, period = 'today' } = req.query;
        
        const now = new Date();
        let startDate: Date;
        let endDate: Date = now;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }

        const where: any = {
            bookingTime: {
                gte: startDate,
                lte: endDate
            }
        };

        if (businessId) {
            where.businessId = businessId as string;
        }

        const [
            totalBookings,
            confirmedBookings,
            pendingBookings,
            cancelledBookings,
            completedBookings,
            revenueData
        ] = await Promise.all([
            prisma.booking.count({ where }),
            prisma.booking.count({ where: { ...where, status: 'confirmed' } }),
            prisma.booking.count({ where: { ...where, status: 'pending' } }),
            prisma.booking.count({ where: { ...where, status: 'cancelled' } }),
            prisma.booking.count({ where: { ...where, status: 'completed' } }),
            prisma.booking.aggregate({
                where: { ...where, status: { in: ['confirmed', 'completed'] } },
                _sum: {
                    totalAmount: true
                }
            })
        ]);

        // Get previous period for comparison
        const previousStartDate = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
        const previousWhere = {
            ...where,
            bookingTime: {
                gte: previousStartDate,
                lt: startDate
            }
        };

        const previousBookings = await prisma.booking.count({ where: previousWhere });
        const bookingGrowth = previousBookings > 0 ? 
            ((totalBookings - previousBookings) / previousBookings) * 100 : 0;

        // Get hourly distribution for today
        const hourlyData = await prisma.booking.groupBy({
            by: ['bookingTime'],
            where: {
                ...where,
                bookingTime: {
                    gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                    lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
                }
            },
            _count: true
        });

        const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => {
            const count = hourlyData.filter(data => 
                new Date(data.bookingTime).getHours() === hour
            ).length;
            return { hour, count };
        });

        res.json({
            success: true,
            data: {
                summary: {
                    totalBookings,
                    confirmedBookings,
                    pendingBookings,
                    cancelledBookings,
                    completedBookings,
                    totalRevenue: revenueData._sum.totalAmount || 0,
                    bookingGrowth: Math.round(bookingGrowth * 100) / 100
                },
                charts: {
                    hourlyDistribution,
                    statusDistribution: [
                        { status: 'confirmed', count: confirmedBookings },
                        { status: 'pending', count: pendingBookings },
                        { status: 'cancelled', count: cancelledBookings },
                        { status: 'completed', count: completedBookings }
                    ]
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching booking statistics:', error);
        next(error);
    }
});

// Admin endpoint: Update booking details
router.put('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const {
            bookingDate,
            bookingTime,
            partySize,
            specialRequests,
            status,
            customerEmail,
            customerPhone
        } = req.body;

        // Update booking
        const booking = await prisma.booking.update({
            where: { id },
            data: {
                bookingDate: bookingDate ? new Date(bookingDate) : undefined,
                bookingTime: bookingTime ? new Date(`${bookingDate}T${bookingTime}`) : undefined,
                partySize: partySize ? Number(partySize) : undefined,
                specialRequests,
                status,
                updatedAt: new Date()
            },
            include: {
                customer: true,
                business: true,
                table: true
            }
        });

        // Update customer contact info if provided
        if (customerEmail || customerPhone) {
            await prisma.customer.update({
                where: { id: booking.customerId },
                data: {
                    email: customerEmail || undefined,
                    phone: customerPhone || undefined
                }
            });
        }

        logger.info(`Booking ${id} updated by admin`);

        res.json({
            success: true,
            data: { booking },
            message: 'Booking updated successfully'
        });

    } catch (error) {
        logger.error('Error updating booking:', error);
        next(error);
    }
});

// Get specific booking
router.get('/:bookingId', authMiddleware, param('bookingId').isString().notEmpty(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        businessId: req.user!.businessId
      },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            preferences: true,
            vipStatus: true
          }
        },
        table: {
          select: {
            id: true,
            number: true,
            capacity: true,
            type: true,
            shape: true
          }
        },
        location: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        payments: {
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    res.json({
      booking
    });

  } catch (error) {
    next(error);
  }
});

// Update booking
router.put('/:bookingId', authMiddleware, requireRole('ADMIN', 'MANAGER', 'STAFF', 'HOST'), updateBookingValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingId } = req.params;
    const {
      bookingDate,
      bookingTime,
      partySize,
      duration,
      specialRequests,
      tableId
    } = req.body;

    // Get existing booking
    const existingBooking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        businessId: req.user!.businessId
      }
    });

    if (!existingBooking) {
      throw new NotFoundError('Booking not found');
    }

    // Check if booking can be modified
    if (existingBooking.status === 'COMPLETED' || existingBooking.status === 'CANCELLED') {
      throw new ConflictError('Cannot modify completed or cancelled booking');
    }

    // Prepare update data
    const updateData: any = {};
    let oldBookingDateTime = existingBooking.bookingTime.toISOString();
    let newBookingDateTime = oldBookingDateTime;

    if (bookingDate || bookingTime) {
      const newDate = bookingDate || moment(existingBooking.bookingDate).format('YYYY-MM-DD');
      const newTime = bookingTime || moment(existingBooking.bookingTime).format('HH:mm');
      newBookingDateTime = moment(`${newDate} ${newTime}`).toISOString();

      // Check availability for new time
      if (newBookingDateTime !== oldBookingDateTime) {
        const reservationResult = await availabilityService.reserveSlot(
          req.user!.businessId,
          existingBooking.locationId,
          newBookingDateTime,
          partySize || existingBooking.partySize,
          duration || existingBooking.duration,
          existingBooking.customerId
        );

        if (!reservationResult.success) {
          throw new ConflictError('New time slot not available');
        }

        // Release old slot
        await availabilityService.releaseSlot(
          req.user!.businessId,
          existingBooking.locationId,
          oldBookingDateTime,
          existingBooking.tableId!,
          existingBooking.duration
        );

        updateData.bookingDate = moment(newDate).toDate();
        updateData.bookingTime = moment(newBookingDateTime).toDate();
        updateData.tableId = tableId || reservationResult.tableId;
      }
    }

    if (partySize) updateData.partySize = partySize;
    if (duration) updateData.duration = duration;
    if (specialRequests !== undefined) updateData.specialRequests = specialRequests;

    // Update booking
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        table: {
          select: {
            id: true,
            number: true,
            capacity: true,
            type: true
          }
        },
        location: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      }
    });

    // Notify real-time availability change
    if (newBookingDateTime !== oldBookingDateTime) {
      await realTimeAvailabilityService.notifyBookingUpdated(
        req.user!.businessId,
        existingBooking.locationId,
        oldBookingDateTime,
        newBookingDateTime,
        updatedBooking.partySize,
        updatedBooking.duration
      );
    }

    // Emit WebSocket event
    websocketEvents.bookingUpdated(req.user!.businessId, updatedBooking);

    logger.info(`Booking updated: ${updatedBooking.bookingNumber}`);

    res.json({
      message: 'Booking updated successfully',
      booking: updatedBooking
    });

  } catch (error) {
    next(error);
  }
});

// Update booking status
router.patch('/:bookingId/status', authMiddleware, requireRole('ADMIN', 'MANAGER', 'STAFF', 'HOST'), [
  param('bookingId').isString().notEmpty().withMessage('Booking ID is required'),
  body('status').isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
  body('notes').optional().isString().withMessage('Notes must be a string')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingId } = req.params;
    const { status, notes } = req.body;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        businessId: req.user!.businessId
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    // Prepare update data
    const updateData: any = { status };

    if (status === 'CHECKED_IN') {
      updateData.checkInTime = new Date();
    } else if (status === 'COMPLETED') {
      updateData.checkOutTime = new Date();
      if (booking.checkInTime) {
        updateData.actualDuration = Math.floor((Date.now() - booking.checkInTime.getTime()) / 60000);
      }
    } else if (status === 'CANCELLED') {
      updateData.cancelledAt = new Date();
      updateData.cancelledReason = notes;

      // Release the slot
      await availabilityService.releaseSlot(
        req.user!.businessId,
        booking.locationId,
        booking.bookingTime.toISOString(),
        booking.tableId!,
        booking.duration
      );
    } else if (status === 'NO_SHOW') {
      updateData.isNoShow = true;
      updateData.noShowReason = notes;

      // Release the slot
      await availabilityService.releaseSlot(
        req.user!.businessId,
        booking.locationId,
        booking.bookingTime.toISOString(),
        booking.tableId!,
        booking.duration
      );
    }

    if (notes) {
      updateData.notes = notes;
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: updateData,
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        table: {
          select: {
            id: true,
            number: true,
            capacity: true,
            type: true
          }
        },
        location: {
          select: {
            id: true,
            name: true,
            address: true
          }
        }
      }
    });

    // Notify real-time availability change for cancellations and no-shows
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      await realTimeAvailabilityService.notifyBookingCancelled(
        req.user!.businessId,
        booking.locationId,
        booking.bookingTime.toISOString(),
        booking.partySize,
        booking.duration
      );
    }

    // Emit WebSocket event
    if (status === 'CANCELLED') {
      websocketEvents.bookingCancelled(req.user!.businessId, updatedBooking);
    } else {
      websocketEvents.bookingUpdated(req.user!.businessId, updatedBooking);
    }

    logger.info(`Booking status updated: ${updatedBooking.bookingNumber} -> ${status}`);

    res.json({
      message: 'Booking status updated successfully',
      booking: updatedBooking
    });

  } catch (error) {
    next(error);
  }
});

// Delete booking (soft delete by cancelling)
router.delete('/:bookingId', authMiddleware, requireRole('ADMIN', 'MANAGER'), param('bookingId').isString().notEmpty(), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { bookingId } = req.params;

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        businessId: req.user!.businessId
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      throw new ConflictError('Cannot delete completed or cancelled booking');
    }

    // Cancel the booking instead of deleting
    const cancelledBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledReason: 'Cancelled by staff'
      }
    });

    // Release the slot
    await availabilityService.releaseSlot(
      req.user!.businessId,
      booking.locationId,
      booking.bookingTime.toISOString(),
      booking.tableId!,
      booking.duration
    );

    // Notify real-time availability change
    await realTimeAvailabilityService.notifyBookingCancelled(
      req.user!.businessId,
      booking.locationId,
      booking.bookingTime.toISOString(),
      booking.partySize,
      booking.duration
    );

    // Emit WebSocket event
    websocketEvents.bookingCancelled(req.user!.businessId, cancelledBooking);

    logger.info(`Booking cancelled: ${cancelledBooking.bookingNumber}`);

    res.json({
      message: 'Booking cancelled successfully',
      booking: cancelledBooking
    });

  } catch (error) {
    next(error);
  }
});

export { router as bookingRoutes }; 