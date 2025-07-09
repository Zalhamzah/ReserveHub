"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_validator_1 = require("express-validator");
const config_1 = require("@/config/config");
const database_1 = require("@/utils/database");
const logger_1 = require("@/utils/logger");
const auth_1 = require("@/middleware/auth");
const errorHandler_1 = require("@/middleware/errorHandler");
const router = (0, express_1.Router)();
exports.authRoutes = router;
// Validation middleware
const registerValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    (0, express_validator_1.body)('firstName').trim().notEmpty().withMessage('First name is required'),
    (0, express_validator_1.body)('lastName').trim().notEmpty().withMessage('Last name is required'),
    (0, express_validator_1.body)('businessName').trim().notEmpty().withMessage('Business name is required'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Valid phone number required')
];
const loginValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('Password is required')
];
const resetPasswordValidation = [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail().withMessage('Valid email required')
];
const updatePasswordValidation = [
    (0, express_validator_1.body)('currentPassword').notEmpty().withMessage('Current password is required'),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];
// Helper functions
const generateTokens = (userId, email, role, businessId) => {
    const payload = { userId, email, role, businessId };
    const accessToken = jsonwebtoken_1.default.sign(payload, config_1.config.jwt.secret, { expiresIn: config_1.config.jwt.expiresIn });
    const refreshToken = jsonwebtoken_1.default.sign(payload, config_1.config.jwt.secret, { expiresIn: config_1.config.jwt.refreshExpiresIn });
    return { accessToken, refreshToken };
};
const hashPassword = async (password) => {
    const saltRounds = 12;
    return await bcryptjs_1.default.hash(password, saltRounds);
};
const comparePassword = async (password, hashedPassword) => {
    return await bcryptjs_1.default.compare(password, hashedPassword);
};
// Register new user and business
router.post('/register', registerValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { email, password, firstName, lastName, businessName, phone } = req.body;
        // Check if user already exists
        const existingUser = await database_1.prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            throw new errorHandler_1.ValidationError('User with this email already exists');
        }
        // Hash password
        const hashedPassword = await hashPassword(password);
        // Create business and user in transaction
        const result = await database_1.prisma.$transaction(async (tx) => {
            // Create business
            const business = await tx.business.create({
                data: {
                    name: businessName,
                    slug: businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
                    email,
                    phone: phone || '',
                    address: '',
                    city: '',
                    state: '',
                    zipCode: '',
                    timezone: config_1.config.business.defaultTimezone,
                    currency: config_1.config.business.defaultCurrency,
                    businessType: 'RESTAURANT',
                    subscriptionPlan: 'BASIC'
                }
            });
            // Create user
            const user = await tx.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    firstName,
                    lastName,
                    phone,
                    role: 'ADMIN',
                    businessId: business.id
                }
            });
            return { user, business };
        });
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(result.user.id, result.user.email, result.user.role, result.business.id);
        // Log successful registration
        logger_1.logger.info(`User registered successfully: ${email}`);
        res.status(201).json({
            message: 'Registration successful',
            user: {
                id: result.user.id,
                email: result.user.email,
                firstName: result.user.firstName,
                lastName: result.user.lastName,
                role: result.user.role,
                businessId: result.business.id
            },
            business: {
                id: result.business.id,
                name: result.business.name,
                slug: result.business.slug
            },
            accessToken,
            refreshToken
        });
    }
    catch (error) {
        next(error);
    }
});
// Login user
router.post('/login', loginValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { email, password } = req.body;
        // Find user with business info
        const user = await database_1.prisma.user.findUnique({
            where: { email },
            include: {
                business: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        isActive: true
                    }
                }
            }
        });
        if (!user) {
            throw new errorHandler_1.UnauthorizedError('Invalid credentials');
        }
        if (!user.isActive) {
            throw new errorHandler_1.UnauthorizedError('Account is deactivated');
        }
        if (!user.business.isActive) {
            throw new errorHandler_1.UnauthorizedError('Business account is deactivated');
        }
        // Verify password
        const isValidPassword = await comparePassword(password, user.password);
        if (!isValidPassword) {
            throw new errorHandler_1.UnauthorizedError('Invalid credentials');
        }
        // Update last login
        await database_1.prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() }
        });
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user.id, user.email, user.role, user.businessId);
        // Log successful login
        logger_1.logger.info(`User logged in successfully: ${email}`);
        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                businessId: user.businessId
            },
            business: {
                id: user.business.id,
                name: user.business.name,
                slug: user.business.slug
            },
            accessToken,
            refreshToken
        });
    }
    catch (error) {
        next(error);
    }
});
// Refresh token
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            throw new errorHandler_1.ValidationError('Refresh token required');
        }
        // Verify refresh token
        const payload = jsonwebtoken_1.default.verify(refreshToken, config_1.config.jwt.secret);
        // Get user data
        const user = await database_1.prisma.user.findFirst({
            where: {
                id: payload.userId,
                isActive: true
            },
            select: {
                id: true,
                email: true,
                role: true,
                businessId: true
            }
        });
        if (!user) {
            throw new errorHandler_1.UnauthorizedError('User not found or inactive');
        }
        // Generate new tokens
        const tokens = generateTokens(user.id, user.email, user.role, user.businessId);
        res.json({
            message: 'Token refreshed successfully',
            ...tokens
        });
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new errorHandler_1.UnauthorizedError('Refresh token expired'));
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return next(new errorHandler_1.UnauthorizedError('Invalid refresh token'));
        }
        next(error);
    }
});
// Get current user profile
router.get('/profile', auth_1.authMiddleware, async (req, res, next) => {
    try {
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                lastLogin: true,
                emailVerified: true,
                phoneVerified: true,
                twoFactorEnabled: true,
                createdAt: true,
                business: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        email: true,
                        phone: true,
                        timezone: true,
                        currency: true,
                        businessType: true,
                        subscriptionPlan: true
                    }
                }
            }
        });
        if (!user) {
            throw new errorHandler_1.NotFoundError('User not found');
        }
        res.json({
            user,
            business: user.business
        });
    }
    catch (error) {
        next(error);
    }
});
// Update user profile
router.put('/profile', auth_1.authMiddleware, [
    (0, express_validator_1.body)('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
    (0, express_validator_1.body)('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Valid phone number required')
], async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { firstName, lastName, phone } = req.body;
        const updatedUser = await database_1.prisma.user.update({
            where: { id: req.user.id },
            data: {
                ...(firstName && { firstName }),
                ...(lastName && { lastName }),
                ...(phone && { phone })
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                role: true,
                lastLogin: true,
                emailVerified: true,
                phoneVerified: true,
                twoFactorEnabled: true,
                createdAt: true
            }
        });
        res.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
    }
    catch (error) {
        next(error);
    }
});
// Update password
router.put('/password', auth_1.authMiddleware, updatePasswordValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { currentPassword, newPassword } = req.body;
        // Get current user
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.user.id }
        });
        if (!user) {
            throw new errorHandler_1.NotFoundError('User not found');
        }
        // Verify current password
        const isValidPassword = await comparePassword(currentPassword, user.password);
        if (!isValidPassword) {
            throw new errorHandler_1.UnauthorizedError('Current password is incorrect');
        }
        // Hash new password
        const hashedNewPassword = await hashPassword(newPassword);
        // Update password
        await database_1.prisma.user.update({
            where: { id: user.id },
            data: { password: hashedNewPassword }
        });
        logger_1.logger.info(`Password updated for user: ${user.email}`);
        res.json({
            message: 'Password updated successfully'
        });
    }
    catch (error) {
        next(error);
    }
});
// Logout (client-side token invalidation)
router.post('/logout', auth_1.authMiddleware, async (req, res, next) => {
    try {
        // In a more sophisticated implementation, you might want to blacklist tokens
        // For now, we'll just log the logout event
        logger_1.logger.info(`User logged out: ${req.user.email}`);
        res.json({
            message: 'Logout successful'
        });
    }
    catch (error) {
        next(error);
    }
});
// Request password reset
router.post('/forgot-password', resetPasswordValidation, async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            throw new errorHandler_1.ValidationError('Validation failed', errors.array());
        }
        const { email } = req.body;
        const user = await database_1.prisma.user.findUnique({
            where: { email }
        });
        // Don't reveal whether user exists or not
        res.json({
            message: 'If an account with this email exists, a password reset link has been sent'
        });
        if (user) {
            // TODO: Implement email service for password reset
            // For now, just log the request
            logger_1.logger.info(`Password reset requested for user: ${email}`);
        }
    }
    catch (error) {
        next(error);
    }
});
//# sourceMappingURL=auth.js.map