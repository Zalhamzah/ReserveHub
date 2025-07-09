"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.businessRoutes = void 0;
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const database_1 = require("@/utils/database");
const logger_1 = require("@/utils/logger");
const auth_1 = require("@/middleware/auth");
const errorHandler_1 = require("@/middleware/errorHandler");
const router = (0, express_1.Router)();
exports.businessRoutes = router;
// Validation middleware
const updateBusinessValidation = [
    (0, express_validator_1.body)('name').optional().trim().notEmpty().withMessage('Business name cannot be empty'),
    (0, express_validator_1.body)('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Valid phone number required'),
    (0, express_validator_1.body)('address').optional().trim().notEmpty().withMessage('Address cannot be empty'),
    (0, express_validator_1.body)('city').optional().trim().notEmpty().withMessage('City cannot be empty'),
    (0, express_validator_1.body)('state').optional().trim().notEmpty().withMessage('State cannot be empty'),
    (0, express_validator_1.body)('zipCode').optional().trim().notEmpty().withMessage('Zip code cannot be empty'),
    (0, express_validator_1.body)('timezone').optional().trim().notEmpty().withMessage('Timezone cannot be empty'),
    (0, express_validator_1.body)('currency').optional().trim().notEmpty().withMessage('Currency cannot be empty'),
    (0, express_validator_1.body)('website').optional().isURL().withMessage('Valid website URL required')
];
const createLocationValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Location name is required'),
    (0, express_validator_1.body)('address').trim().notEmpty().withMessage('Address is required'),
    (0, express_validator_1.body)('city').trim().notEmpty().withMessage('City is required'),
    (0, express_validator_1.body)('state').trim().notEmpty().withMessage('State is required'),
    (0, express_validator_1.body)('zipCode').trim().notEmpty().withMessage('Zip code is required'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Valid phone number required'),
    (0, express_validator_1.body)('email').optional().isEmail().normalizeEmail().withMessage('Valid email required')
];
// Get current business profile
router.get('/profile', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const business = await database_1.prisma.business.findUnique({
            where: { id: req.user.businessId },
            include: {
                locations: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        city: true,
                        state: true,
                        zipCode: true,
                        phone: true,
                        email: true,
                        isActive: true,
                        createdAt: true
                    }
                },
                users: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        role: true,
                        lastLogin: true,
                        createdAt: true
                    }
                },
                _count: {
                    select: {
                        customers: true,
                        bookings: true,
                        tables: true
                    }
                }
            }
        });
        if (!business) {
            throw new errorHandler_1.NotFoundError('Business not found');
        }
        res.json({
            business: {
                id: business.id,
                name: business.name,
                slug: business.slug,
                description: business.description,
                email: business.email,
                phone: business.phone,
                address: business.address,
                city: business.city,
                state: business.state,
                zipCode: business.zipCode,
                country: business.country,
                timezone: business.timezone,
                currency: business.currency,
                website: business.website,
                logo: business.logo,
                businessType: business.businessType,
                subscriptionPlan: business.subscriptionPlan,
                isActive: business.isActive,
                settings: business.settings,
                createdAt: business.createdAt,
                updatedAt: business.updatedAt
            },
            locations: business.locations,
            users: business.users,
            stats: {
                totalCustomers: business._count.customers,
                totalBookings: business._count.bookings,
                totalTables: business._count.tables,
                totalLocations: business.locations.length,
                totalUsers: business.users.length
            }
        });
    }
    catch (error) {
        next(error);
    }
});
// Update business profile
router.put('/profile', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), updateBusinessValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { name, description, email, phone, address, city, state, zipCode, timezone, currency, website, businessType } = req.body;
        // Generate new slug if name changed
        let slug;
        if (name) {
            slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
            // Check if slug already exists
            const existingBusiness = await database_1.prisma.business.findFirst({
                where: {
                    slug,
                    id: { not: req.user.businessId }
                }
            });
            if (existingBusiness) {
                slug = `${slug}-${Date.now()}`;
            }
        }
        const updatedBusiness = await database_1.prisma.business.update({
            where: { id: req.user.businessId },
            data: {
                ...(name && { name, slug }),
                ...(description && { description }),
                ...(email && { email }),
                ...(phone && { phone }),
                ...(address && { address }),
                ...(city && { city }),
                ...(state && { state }),
                ...(zipCode && { zipCode }),
                ...(timezone && { timezone }),
                ...(currency && { currency }),
                ...(website && { website }),
                ...(businessType && { businessType })
            },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                email: true,
                phone: true,
                address: true,
                city: true,
                state: true,
                zipCode: true,
                country: true,
                timezone: true,
                currency: true,
                website: true,
                businessType: true,
                updatedAt: true
            }
        });
        logger_1.logger.info(`Business profile updated: ${updatedBusiness.name} (${updatedBusiness.id})`);
        res.json({
            message: 'Business profile updated successfully',
            business: updatedBusiness
        });
    }
    catch (error) {
        next(error);
    }
});
// Update business settings
router.put('/settings', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') {
            throw new errorHandler_1.ValidationError('Settings must be a valid object');
        }
        const updatedBusiness = await database_1.prisma.business.update({
            where: { id: req.user.businessId },
            data: { settings },
            select: {
                id: true,
                name: true,
                settings: true,
                updatedAt: true
            }
        });
        logger_1.logger.info(`Business settings updated: ${updatedBusiness.name} (${updatedBusiness.id})`);
        res.json({
            message: 'Business settings updated successfully',
            business: updatedBusiness
        });
    }
    catch (error) {
        next(error);
    }
});
// Get all locations
router.get('/locations', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const locations = await database_1.prisma.location.findMany({
            where: {
                businessId: req.user.businessId,
                isActive: true
            },
            include: {
                tables: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        number: true,
                        capacity: true,
                        type: true,
                        isActive: true
                    }
                },
                _count: {
                    select: {
                        bookings: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json({
            locations: locations.map(location => ({
                id: location.id,
                name: location.name,
                address: location.address,
                city: location.city,
                state: location.state,
                zipCode: location.zipCode,
                phone: location.phone,
                email: location.email,
                isActive: location.isActive,
                settings: location.settings,
                tables: location.tables,
                stats: {
                    totalTables: location.tables.length,
                    totalBookings: location._count.bookings
                },
                createdAt: location.createdAt,
                updatedAt: location.updatedAt
            }))
        });
    }
    catch (error) {
        next(error);
    }
});
// Create new location
router.post('/locations', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), createLocationValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { name, address, city, state, zipCode, phone, email, settings } = req.body;
        const newLocation = await database_1.prisma.location.create({
            data: {
                name,
                address,
                city,
                state,
                zipCode,
                phone,
                email,
                businessId: req.user.businessId,
                settings: settings || {}
            },
            select: {
                id: true,
                name: true,
                address: true,
                city: true,
                state: true,
                zipCode: true,
                phone: true,
                email: true,
                isActive: true,
                settings: true,
                createdAt: true
            }
        });
        logger_1.logger.info(`New location created: ${newLocation.name} (${newLocation.id})`);
        res.status(201).json({
            message: 'Location created successfully',
            location: newLocation
        });
    }
    catch (error) {
        next(error);
    }
});
// Get specific location
router.get('/locations/:locationId', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const { locationId } = req.params;
        const location = await database_1.prisma.location.findFirst({
            where: {
                id: locationId,
                businessId: req.user.businessId
            },
            include: {
                tables: {
                    where: { isActive: true }
                },
                shiftSchedules: {
                    where: { isActive: true }
                },
                _count: {
                    select: {
                        bookings: true
                    }
                }
            }
        });
        if (!location) {
            throw new errorHandler_1.NotFoundError('Location not found');
        }
        res.json({
            location: {
                id: location.id,
                name: location.name,
                address: location.address,
                city: location.city,
                state: location.state,
                zipCode: location.zipCode,
                phone: location.phone,
                email: location.email,
                isActive: location.isActive,
                settings: location.settings,
                tables: location.tables,
                schedules: location.shiftSchedules,
                stats: {
                    totalTables: location.tables.length,
                    totalBookings: location._count.bookings
                },
                createdAt: location.createdAt,
                updatedAt: location.updatedAt
            }
        });
    }
    catch (error) {
        next(error);
    }
});
// Update location
router.put('/locations/:locationId', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), createLocationValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { locationId } = req.params;
        const { name, address, city, state, zipCode, phone, email, settings } = req.body;
        // Verify location belongs to business
        const existingLocation = await database_1.prisma.location.findFirst({
            where: {
                id: locationId,
                businessId: req.user.businessId
            }
        });
        if (!existingLocation) {
            throw new errorHandler_1.NotFoundError('Location not found');
        }
        const updatedLocation = await database_1.prisma.location.update({
            where: { id: locationId },
            data: {
                name,
                address,
                city,
                state,
                zipCode,
                phone,
                email,
                ...(settings && { settings })
            },
            select: {
                id: true,
                name: true,
                address: true,
                city: true,
                state: true,
                zipCode: true,
                phone: true,
                email: true,
                isActive: true,
                settings: true,
                updatedAt: true
            }
        });
        logger_1.logger.info(`Location updated: ${updatedLocation.name} (${updatedLocation.id})`);
        res.json({
            message: 'Location updated successfully',
            location: updatedLocation
        });
    }
    catch (error) {
        next(error);
    }
});
// Deactivate location
router.delete('/locations/:locationId', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        const { locationId } = req.params;
        // Verify location belongs to business
        const existingLocation = await database_1.prisma.location.findFirst({
            where: {
                id: locationId,
                businessId: req.user.businessId
            }
        });
        if (!existingLocation) {
            throw new errorHandler_1.NotFoundError('Location not found');
        }
        // Check if there are active bookings
        const activeBookings = await database_1.prisma.booking.count({
            where: {
                locationId,
                status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] }
            }
        });
        if (activeBookings > 0) {
            throw new errorHandler_1.ValidationError('Cannot deactivate location with active bookings');
        }
        const deactivatedLocation = await database_1.prisma.location.update({
            where: { id: locationId },
            data: { isActive: false },
            select: {
                id: true,
                name: true,
                isActive: true,
                updatedAt: true
            }
        });
        logger_1.logger.info(`Location deactivated: ${deactivatedLocation.name} (${deactivatedLocation.id})`);
        res.json({
            message: 'Location deactivated successfully',
            location: deactivatedLocation
        });
    }
    catch (error) {
        next(error);
    }
});
// Get business users
router.get('/users', auth_1.authMiddleware, (0, auth_1.requireRole)('ADMIN', 'MANAGER'), async (req, res, next) => {
    try {
        const users = await database_1.prisma.user.findMany({
            where: { businessId: req.user.businessId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                isActive: true,
                lastLogin: true,
                emailVerified: true,
                phoneVerified: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({
            users
        });
    }
    catch (error) {
        next(error);
    }
});
// Get business statistics
router.get('/stats', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const businessId = req.user.businessId;
        // Get various counts
        const [totalCustomers, totalBookings, totalTables, totalLocations, totalUsers, activeBookings, completedBookings, cancelledBookings, recentBookings] = await Promise.all([
            database_1.prisma.customer.count({ where: { businessId } }),
            database_1.prisma.booking.count({ where: { businessId } }),
            database_1.prisma.table.count({ where: { businessId } }),
            database_1.prisma.location.count({ where: { businessId, isActive: true } }),
            database_1.prisma.user.count({ where: { businessId, isActive: true } }),
            database_1.prisma.booking.count({ where: { businessId, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'SEATED'] } } }),
            database_1.prisma.booking.count({ where: { businessId, status: 'COMPLETED' } }),
            database_1.prisma.booking.count({ where: { businessId, status: { in: ['CANCELLED', 'NO_SHOW'] } } }),
            database_1.prisma.booking.findMany({
                where: { businessId },
                select: {
                    id: true,
                    bookingNumber: true,
                    status: true,
                    bookingDate: true,
                    partySize: true,
                    customer: {
                        select: {
                            firstName: true,
                            lastName: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            })
        ]);
        res.json({
            stats: {
                totalCustomers,
                totalBookings,
                totalTables,
                totalLocations,
                totalUsers,
                activeBookings,
                completedBookings,
                cancelledBookings,
                bookingStats: {
                    completionRate: totalBookings > 0 ? ((completedBookings / totalBookings) * 100).toFixed(1) : '0.0',
                    cancellationRate: totalBookings > 0 ? (((cancelledBookings) / totalBookings) * 100).toFixed(1) : '0.0'
                }
            },
            recentBookings
        });
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=business.js.map