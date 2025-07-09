import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult, param, query } from 'express-validator';
import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { authMiddleware, requireRole, requireBusinessAccess } from '@/middleware/auth';
import { ValidationError, NotFoundError, ConflictError } from '@/middleware/errorHandler';
import { availabilityService } from '@/services/availabilityService';
import { realTimeAvailabilityService } from '@/services/realTimeAvailabilityService';
import { websocketEvents } from '@/utils/websocket';
import moment from 'moment-timezone';
import { v4 as uuidv4 } from 'uuid';

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

// Public endpoint for customer reservations (no auth required)
const publicBookingValidation = [
  body('firstName').isString().isLength({ min: 1, max: 50 }).withMessage('First name is required and must be 1-50 characters'),
  body('lastName').isString().isLength({ min: 1, max: 50 }).withMessage('Last name is required and must be 1-50 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').isString().matches(/^\+?[\d\s\-\(\)]+$/).withMessage('Valid phone number is required'),
  body('businessId').isString().notEmpty().withMessage('Business ID is required'),
  body('locationId').optional().isString().withMessage('Location ID must be a string'),
  body('bookingDate').isISO8601().withMessage('Valid booking date is required'),
  body('bookingTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
  body('partySize').isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  body('specialRequests').optional().isString().withMessage('Special requests must be a string')
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

    // Verify business exists and is active
    const business = await prisma.business.findFirst({
      where: {
        id: businessId as string,
        isActive: true
      }
    });

    if (!business) {
      throw new NotFoundError('Business not found');
    }

    // Get available time slots for the date
    const availableSlots = await availabilityService.getAvailableSlots({
      businessId: businessId as string,
      locationId: locationId as string,
      date: date as string,
      partySize: parseInt(partySize as string)
    });

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
    next(error);
  }
});

// Public endpoint - Create booking without authentication
router.post('/public/reserve', publicBookingValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      businessId,
      locationId,
      bookingDate,
      bookingTime,
      partySize,
      specialRequests
    } = req.body;

    // Verify business exists and is active
    const business = await prisma.business.findFirst({
      where: {
        id: businessId,
        isActive: true
      }
    });

    if (!business) {
      throw new NotFoundError('Business not found');
    }

    // Create or find customer
    let customer = await prisma.customer.findFirst({
      where: {
        email,
        businessId
      }
    });

    if (!customer) {
      // Create new customer
      customer = await prisma.customer.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          businessId,
          vipStatus: 'REGULAR',
          isActive: true
        }
      });
    } else {
      // Update existing customer info
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: {
          firstName,
          lastName,
          phone,
          isActive: true
        }
      });
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
      90, // Default 90 minutes duration
      customer.id
    );

    if (!reservationResult.success) {
      throw new ConflictError('Time slot not available');
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        bookingNumber: generateBookingNumber(),
        customerId: customer.id,
        businessId,
        locationId,
        tableId: reservationResult.tableId,
        bookingDate: moment(bookingDate).toDate(),
        bookingTime: moment(bookingDateTime).toDate(),
        duration: 90,
        partySize,
        status: 'PENDING',
        confirmationCode: generateConfirmationCode(),
        specialRequests,
        source: 'ONLINE',
        createdById: systemUser.id
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
      90
    );

    // Emit WebSocket event
    websocketEvents.bookingCreated(businessId, booking);

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

// Get all bookings with filtering and pagination
router.get('/', authMiddleware, bookingQueryValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const {
      date,
      status,
      locationId,
      customerId,
      page = 1,
      limit = 20
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const whereClause: any = {
      businessId: req.user!.businessId
    };

    if (date) {
      const startDate = moment(date as string).startOf('day').toDate();
      const endDate = moment(date as string).endOf('day').toDate();
      whereClause.bookingDate = {
        gte: startDate,
        lte: endDate
      };
    }

    if (status) {
      whereClause.status = status;
    }

    if (locationId) {
      whereClause.locationId = locationId;
    }

    if (customerId) {
      whereClause.customerId = customerId;
    }

    // Get bookings with pagination
    const [bookings, totalCount] = await Promise.all([
      prisma.booking.findMany({
        where: whereClause,
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
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: [
          { bookingDate: 'desc' },
          { bookingTime: 'desc' }
        ],
        skip,
        take: Number(limit)
      }),
      prisma.booking.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(totalCount / Number(limit));

    res.json({
      bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalCount,
        totalPages,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      }
    });

  } catch (error) {
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