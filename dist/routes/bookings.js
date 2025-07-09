"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const database_1 = require("@/utils/database");
const logger_1 = require("@/utils/logger");
const auth_1 = require("@/middleware/auth");
const errorHandler_1 = require("@/middleware/errorHandler");
const availabilityService_1 = require("@/services/availabilityService");
const realTimeAvailabilityService_1 = require("@/services/realTimeAvailabilityService");
const websocket_1 = require("@/utils/websocket");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const router = (0, express_1.Router)();
exports.bookingRoutes = router;
// Validation middleware
const createBookingValidation = [
    (0, express_validator_1.body)('customerId').isString().notEmpty().withMessage('Customer ID is required'),
    (0, express_validator_1.body)('locationId').optional().isString().withMessage('Location ID must be a string'),
    (0, express_validator_1.body)('bookingDate').isISO8601().withMessage('Valid booking date is required'),
    (0, express_validator_1.body)('bookingTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
    (0, express_validator_1.body)('partySize').isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
    (0, express_validator_1.body)('duration').optional().isInt({ min: 30, max: 480 }).withMessage('Duration must be between 30 and 480 minutes'),
    (0, express_validator_1.body)('specialRequests').optional().isString().withMessage('Special requests must be a string'),
    (0, express_validator_1.body)('tableId').optional().isString().withMessage('Table ID must be a string')
];
const updateBookingValidation = [
    (0, express_validator_1.param)('bookingId').isString().notEmpty().withMessage('Booking ID is required'),
    (0, express_validator_1.body)('bookingDate').optional().isISO8601().withMessage('Valid booking date is required'),
    (0, express_validator_1.body)('bookingTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Valid booking time (HH:MM) is required'),
    (0, express_validator_1.body)('partySize').optional().isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
    (0, express_validator_1.body)('duration').optional().isInt({ min: 30, max: 480 }).withMessage('Duration must be between 30 and 480 minutes'),
    (0, express_validator_1.body)('specialRequests').optional().isString().withMessage('Special requests must be a string'),
    (0, express_validator_1.body)('tableId').optional().isString().withMessage('Table ID must be a string')
];
const bookingQueryValidation = [
    (0, express_validator_1.query)('date').optional().isISO8601().withMessage('Valid date is required'),
    (0, express_validator_1.query)('status').optional().isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
    (0, express_validator_1.query)('locationId').optional().isString().withMessage('Location ID must be a string'),
    (0, express_validator_1.query)('customerId').optional().isString().withMessage('Customer ID must be a string'),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
];
// Helper functions
const generateBookingNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `BK${timestamp}${random}`;
};
const generateConfirmationCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};
// Create new booking
router.post('/', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER', 'STAFF', 'HOST'), createBookingValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { customerId, locationId, bookingDate, bookingTime, partySize, duration = 90, specialRequests, tableId } = req.body;
        // Verify customer exists and belongs to business
        const customer = await database_1.prisma.customer.findFirst({
            where: {
                id: customerId,
                businessId: req.user.businessId
            }
        });
        if (!customer) {
            throw new errorHandler_1.NotFoundError('Customer not found');
        }
        // Verify location belongs to business (if provided)
        if (locationId) {
            const location = await database_1.prisma.location.findFirst({
                where: {
                    id: locationId,
                    businessId: req.user.businessId,
                    isActive: true
                }
            });
            if (!location) {
                throw new errorHandler_1.NotFoundError('Location not found');
            }
        }
        // Combine date and time
        const bookingDateTime = (0, moment_timezone_1.default)(`${bookingDate} ${bookingTime}`).toISOString();
        // Check availability and reserve slot
        const reservationResult = await availabilityService_1.availabilityService.reserveSlot(req.user.businessId, locationId, bookingDateTime, partySize, duration, customerId);
        if (!reservationResult.success) {
            throw new errorHandler_1.ConflictError('Time slot not available');
        }
        const finalTableId = tableId || reservationResult.tableId;
        // Create booking
        const booking = await database_1.prisma.booking.create({
            data: {
                bookingNumber: generateBookingNumber(),
                customerId,
                businessId: req.user.businessId,
                locationId,
                tableId: finalTableId,
                bookingDate: (0, moment_timezone_1.default)(bookingDate).toDate(),
                bookingTime: (0, moment_timezone_1.default)(bookingDateTime).toDate(),
                duration,
                partySize,
                status: 'PENDING',
                confirmationCode: generateConfirmationCode(),
                specialRequests,
                source: 'DIRECT',
                createdById: req.user.id
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
        await realTimeAvailabilityService_1.realTimeAvailabilityService.notifyBookingCreated(req.user.businessId, locationId, bookingDateTime, partySize, duration);
        // Emit WebSocket event
        websocket_1.websocketEvents.bookingCreated(req.user.businessId, booking);
        logger_1.logger.info(`Booking created: ${booking.bookingNumber} for customer ${customer.firstName} ${customer.lastName}`);
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
    }
    catch (error) {
        next(error);
    }
});
// Get all bookings with filtering and pagination
router.get('/', auth_1.authMiddleware, bookingQueryValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { date, status, locationId, customerId, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        // Build where clause
        const whereClause = {
            businessId: req.user.businessId
        };
        if (date) {
            const startDate = (0, moment_timezone_1.default)(date).startOf('day').toDate();
            const endDate = (0, moment_timezone_1.default)(date).endOf('day').toDate();
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
            database_1.prisma.booking.findMany({
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
            database_1.prisma.booking.count({ where: whereClause })
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
    }
    catch (error) {
        next(error);
    }
});
// Get specific booking
router.get('/:bookingId', auth_1.authMiddleware, (0, express_validator_1.param)('bookingId').isString().notEmpty(), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { bookingId } = req.params;
        const booking = await database_1.prisma.booking.findFirst({
            where: {
                id: bookingId,
                businessId: req.user.businessId
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
            throw new errorHandler_1.NotFoundError('Booking not found');
        }
        res.json({
            booking
        });
    }
    catch (error) {
        next(error);
    }
});
// Update booking
router.put('/:bookingId', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER', 'STAFF', 'HOST'), updateBookingValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { bookingId } = req.params;
        const { bookingDate, bookingTime, partySize, duration, specialRequests, tableId } = req.body;
        // Get existing booking
        const existingBooking = await database_1.prisma.booking.findFirst({
            where: {
                id: bookingId,
                businessId: req.user.businessId
            }
        });
        if (!existingBooking) {
            throw new errorHandler_1.NotFoundError('Booking not found');
        }
        // Check if booking can be modified
        if (existingBooking.status === 'COMPLETED' || existingBooking.status === 'CANCELLED') {
            throw new errorHandler_1.ConflictError('Cannot modify completed or cancelled booking');
        }
        // Prepare update data
        const updateData = {};
        let oldBookingDateTime = existingBooking.bookingTime.toISOString();
        let newBookingDateTime = oldBookingDateTime;
        if (bookingDate || bookingTime) {
            const newDate = bookingDate || (0, moment_timezone_1.default)(existingBooking.bookingDate).format('YYYY-MM-DD');
            const newTime = bookingTime || (0, moment_timezone_1.default)(existingBooking.bookingTime).format('HH:mm');
            newBookingDateTime = (0, moment_timezone_1.default)(`${newDate} ${newTime}`).toISOString();
            // Check availability for new time
            if (newBookingDateTime !== oldBookingDateTime) {
                const reservationResult = await availabilityService_1.availabilityService.reserveSlot(req.user.businessId, existingBooking.locationId, newBookingDateTime, partySize || existingBooking.partySize, duration || existingBooking.duration, existingBooking.customerId);
                if (!reservationResult.success) {
                    throw new errorHandler_1.ConflictError('New time slot not available');
                }
                // Release old slot
                await availabilityService_1.availabilityService.releaseSlot(req.user.businessId, existingBooking.locationId, oldBookingDateTime, existingBooking.tableId, existingBooking.duration);
                updateData.bookingDate = (0, moment_timezone_1.default)(newDate).toDate();
                updateData.bookingTime = (0, moment_timezone_1.default)(newBookingDateTime).toDate();
                updateData.tableId = tableId || reservationResult.tableId;
            }
        }
        if (partySize)
            updateData.partySize = partySize;
        if (duration)
            updateData.duration = duration;
        if (specialRequests !== undefined)
            updateData.specialRequests = specialRequests;
        // Update booking
        const updatedBooking = await database_1.prisma.booking.update({
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
            await realTimeAvailabilityService_1.realTimeAvailabilityService.notifyBookingUpdated(req.user.businessId, existingBooking.locationId, oldBookingDateTime, newBookingDateTime, updatedBooking.partySize, updatedBooking.duration);
        }
        // Emit WebSocket event
        websocket_1.websocketEvents.bookingUpdated(req.user.businessId, updatedBooking);
        logger_1.logger.info(`Booking updated: ${updatedBooking.bookingNumber}`);
        res.json({
            message: 'Booking updated successfully',
            booking: updatedBooking
        });
    }
    catch (error) {
        next(error);
    }
});
// Update booking status
router.patch('/:bookingId/status', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER', 'STAFF', 'HOST'), [
    (0, express_validator_1.param)('bookingId').isString().notEmpty().withMessage('Booking ID is required'),
    (0, express_validator_1.body)('status').isIn(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).withMessage('Invalid status'),
    (0, express_validator_1.body)('notes').optional().isString().withMessage('Notes must be a string')
], async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { bookingId } = req.params;
        const { status, notes } = req.body;
        const booking = await database_1.prisma.booking.findFirst({
            where: {
                id: bookingId,
                businessId: req.user.businessId
            }
        });
        if (!booking) {
            throw new errorHandler_1.NotFoundError('Booking not found');
        }
        // Prepare update data
        const updateData = { status };
        if (status === 'CHECKED_IN') {
            updateData.checkInTime = new Date();
        }
        else if (status === 'COMPLETED') {
            updateData.checkOutTime = new Date();
            if (booking.checkInTime) {
                updateData.actualDuration = Math.floor((Date.now() - booking.checkInTime.getTime()) / 60000);
            }
        }
        else if (status === 'CANCELLED') {
            updateData.cancelledAt = new Date();
            updateData.cancelledReason = notes;
            // Release the slot
            await availabilityService_1.availabilityService.releaseSlot(req.user.businessId, booking.locationId, booking.bookingTime.toISOString(), booking.tableId, booking.duration);
        }
        else if (status === 'NO_SHOW') {
            updateData.isNoShow = true;
            updateData.noShowReason = notes;
            // Release the slot
            await availabilityService_1.availabilityService.releaseSlot(req.user.businessId, booking.locationId, booking.bookingTime.toISOString(), booking.tableId, booking.duration);
        }
        if (notes) {
            updateData.notes = notes;
        }
        const updatedBooking = await database_1.prisma.booking.update({
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
            await realTimeAvailabilityService_1.realTimeAvailabilityService.notifyBookingCancelled(req.user.businessId, booking.locationId, booking.bookingTime.toISOString(), booking.partySize, booking.duration);
        }
        // Emit WebSocket event
        if (status === 'CANCELLED') {
            websocket_1.websocketEvents.bookingCancelled(req.user.businessId, updatedBooking);
        }
        else {
            websocket_1.websocketEvents.bookingUpdated(req.user.businessId, updatedBooking);
        }
        logger_1.logger.info(`Booking status updated: ${updatedBooking.bookingNumber} -> ${status}`);
        res.json({
            message: 'Booking status updated successfully',
            booking: updatedBooking
        });
    }
    catch (error) {
        next(error);
    }
});
// Delete booking (soft delete by cancelling)
router.delete('/:bookingId', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), (0, express_validator_1.param)('bookingId').isString().notEmpty(), async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { bookingId } = req.params;
        const booking = await database_1.prisma.booking.findFirst({
            where: {
                id: bookingId,
                businessId: req.user.businessId
            }
        });
        if (!booking) {
            throw new errorHandler_1.NotFoundError('Booking not found');
        }
        if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
            throw new errorHandler_1.ConflictError('Cannot delete completed or cancelled booking');
        }
        // Cancel the booking instead of deleting
        const cancelledBooking = await database_1.prisma.booking.update({
            where: { id: bookingId },
            data: {
                status: 'CANCELLED',
                cancelledAt: new Date(),
                cancelledReason: 'Cancelled by staff'
            }
        });
        // Release the slot
        await availabilityService_1.availabilityService.releaseSlot(req.user.businessId, booking.locationId, booking.bookingTime.toISOString(), booking.tableId, booking.duration);
        // Notify real-time availability change
        await realTimeAvailabilityService_1.realTimeAvailabilityService.notifyBookingCancelled(req.user.businessId, booking.locationId, booking.bookingTime.toISOString(), booking.partySize, booking.duration);
        // Emit WebSocket event
        websocket_1.websocketEvents.bookingCancelled(req.user.businessId, cancelledBooking);
        logger_1.logger.info(`Booking cancelled: ${cancelledBooking.bookingNumber}`);
        res.json({
            message: 'Booking cancelled successfully',
            booking: cancelledBooking
        });
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=bookings.js.map