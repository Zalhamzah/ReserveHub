import { Router, Request, Response, NextFunction } from 'express';
import { query, param, body, validationResult } from 'express-validator';
import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { authMiddleware, requireRole } from '@/middleware/auth';
import { ValidationError, NotFoundError } from '@/middleware/errorHandler';
import { emailService } from '@/services/emailService';

const router = Router();

// Apply authentication middleware to all admin routes
router.use(authMiddleware);
router.use(requireRole('ADMIN', 'MANAGER'));

// Dashboard statistics endpoint
router.get('/dashboard/stats', [
  query('period').optional().isIn(['today', 'week', 'month', 'year']).withMessage('Invalid period'),
  query('businessId').optional().isString().withMessage('Business ID must be a string')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { period = 'today', businessId } = req.query;
    const userBusinessId = req.user?.businessId;
    const targetBusinessId = businessId as string || userBusinessId;

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

    const where = {
      businessId: targetBusinessId,
      bookingTime: {
        gte: startDate,
        lte: endDate
      }
    };

    const [
      totalBookings,
      confirmedBookings,
      pendingBookings,
      cancelledBookings,
      completedBookings,
      revenueData
    ] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.count({ where: { ...where, status: 'CONFIRMED' } }),
      prisma.booking.count({ where: { ...where, status: 'PENDING' } }),
      prisma.booking.count({ where: { ...where, status: 'CANCELLED' } }),
      prisma.booking.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.booking.aggregate({
        where: { ...where, status: { in: ['CONFIRMED', 'COMPLETED'] } },
        _sum: {
          totalAmount: true
        }
      })
    ]);

    // Get previous period for comparison
    const previousStartDate = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const previousWhere = {
      businessId: targetBusinessId,
      bookingTime: {
        gte: previousStartDate,
        lt: startDate
      }
    };

    const previousBookings = await prisma.booking.count({ where: previousWhere });
    const bookingGrowth = previousBookings > 0 ? 
      ((totalBookings - previousBookings) / previousBookings) * 100 : 0;

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
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching dashboard statistics:', error);
    next(error);
  }
});

// Get all bookings with filtering and pagination
router.get('/bookings', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  query('sort').optional().isIn(['createdAt:asc', 'createdAt:desc', 'bookingTime:asc', 'bookingTime:desc']).withMessage('Invalid sort option')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { 
      page = 1, 
      limit = 20, 
      status, 
      startDate, 
      endDate,
      sort = 'createdAt:desc'
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const [sortField, sortOrder] = (sort as string).split(':');

    const where: any = {
      businessId: req.user?.businessId
    };
    
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
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          business: {
            select: {
              id: true,
              name: true,
              businessType: true
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

// Update booking status
router.patch('/bookings/:id/status', [
  param('id').isString().notEmpty().withMessage('Booking ID is required'),
  body('status').isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status value')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { id } = req.params;
    const { status } = req.body;

    const booking = await prisma.booking.findFirst({
      where: { 
        id, 
        businessId: req.user?.businessId 
      },
      include: {
        customer: true,
        business: true,
        table: true,
        location: true
      }
    });

    if (!booking) {
      throw new NotFoundError('Booking not found');
    }

    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: { 
        status,
        updatedAt: new Date(),
        ...(status === 'CANCELLED' && { cancelledAt: new Date() }),
        ...(status === 'CHECKED_IN' && { checkInTime: new Date() }),
        ...(status === 'COMPLETED' && { checkOutTime: new Date() })
      },
      include: {
        customer: true,
        business: true,
        table: true,
        location: true
      }
    });

    // Send notifications based on status change
    try {
      if (status === 'CONFIRMED') {
        await emailService.sendBookingConfirmation({
          customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
          customerEmail: booking.customer.email!,
          businessName: booking.business.name,
          confirmationCode: booking.confirmationCode,
          bookingDate: booking.bookingDate.toISOString(),
          bookingTime: booking.bookingTime.toISOString(),
          partySize: booking.partySize,
          specialRequests: booking.specialRequests
        });
      } else if (status === 'CANCELLED') {
        await emailService.sendBookingCancellation({
          customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
          customerEmail: booking.customer.email!,
          businessName: booking.business.name,
          bookingDate: booking.bookingDate.toISOString(),
          bookingTime: booking.bookingTime.toISOString()
        });
      }
    } catch (emailError) {
      logger.warn('Failed to send email notification:', emailError);
    }

    logger.info(`Booking ${id} status updated to ${status} by ${req.user?.email}`);

    res.json({
      success: true,
      data: { booking: updatedBooking },
      message: `Booking ${status.toLowerCase()} successfully`
    });

  } catch (error) {
    logger.error('Error updating booking status:', error);
    next(error);
  }
});

// Update booking details
router.put('/bookings/:id', [
  param('id').isString().notEmpty().withMessage('Booking ID is required'),
  body('bookingDate').optional().isISO8601().withMessage('Valid booking date is required'),
  body('bookingTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
  body('partySize').optional().isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  body('specialRequests').optional().isString().withMessage('Special requests must be a string'),
  body('status').optional().isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
  body('customerEmail').optional().isEmail().withMessage('Valid email is required'),
  body('customerPhone').optional().isString().withMessage('Phone must be a string')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

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

    // Verify booking exists and belongs to user's business
    const existingBooking = await prisma.booking.findFirst({
      where: { 
        id, 
        businessId: req.user?.businessId 
      },
      include: {
        customer: true
      }
    });

    if (!existingBooking) {
      throw new NotFoundError('Booking not found');
    }

    // Prepare booking update data
    const updateData: any = {
      updatedAt: new Date()
    };

    if (bookingDate) updateData.bookingDate = new Date(bookingDate);
    if (bookingTime) {
      const dateStr = bookingDate || existingBooking.bookingDate.toISOString().split('T')[0];
      updateData.bookingTime = new Date(`${dateStr}T${bookingTime}:00`);
    }
    if (partySize) updateData.partySize = Number(partySize);
    if (specialRequests !== undefined) updateData.specialRequests = specialRequests;
    if (status) updateData.status = status;

    // Update booking
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        business: true,
        table: true,
        location: true
      }
    });

    // Update customer contact info if provided
    if (customerEmail || customerPhone) {
      await prisma.customer.update({
        where: { id: existingBooking.customerId },
        data: {
          ...(customerEmail && { email: customerEmail }),
          ...(customerPhone && { phone: customerPhone })
        }
      });
    }

    logger.info(`Booking ${id} updated by ${req.user?.email}`);

    res.json({
      success: true,
      data: { booking: updatedBooking },
      message: 'Booking updated successfully'
    });

  } catch (error) {
    logger.error('Error updating booking:', error);
    next(error);
  }
});

// Get customer list for admin
router.get('/customers', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { 
      page = 1, 
      limit = 20, 
      search 
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {
      businessId: req.user?.businessId
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: {
              bookings: true
            }
          },
          bookings: {
            select: {
              bookingTime: true,
              status: true
            },
            orderBy: { bookingTime: 'desc' },
            take: 1
          }
        }
      }),
      prisma.customer.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching customers:', error);
    next(error);
  }
});

export { router as adminRoutes }; 