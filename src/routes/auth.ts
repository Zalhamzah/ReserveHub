import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { config } from '@/config/config';
import { prisma } from '@/utils/database';
import { logger } from '@/utils/logger';
import { authMiddleware } from '@/middleware/auth';
import { UnauthorizedError, ValidationError, NotFoundError } from '@/middleware/errorHandler';

const router = Router();

// Validation middleware
const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('businessName').trim().notEmpty().withMessage('Business name is required'),
  body('phone').optional().isMobilePhone('any').withMessage('Valid phone number required')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required')
];

const resetPasswordValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required')
];

const updatePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];

// Helper functions
const generateTokens = (userId: string, email: string, role: string, businessId: string) => {
  const payload = { userId, email, role, businessId };
  
  const accessToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn } as jwt.SignOptions);
  const refreshToken = jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions);
  
  return { accessToken, refreshToken };
};

const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return await bcrypt.compare(password, hashedPassword);
};

// Register new user and business
router.post('/register', registerValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { email, password, firstName, lastName, businessName, phone } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ValidationError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create business and user in transaction
    const result = await prisma.$transaction(async (tx) => {
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
          timezone: config.business.defaultTimezone,
          currency: config.business.defaultCurrency,
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
    const { accessToken, refreshToken } = generateTokens(
      result.user.id,
      result.user.email,
      result.user.role,
      result.business.id
    );

    // Log successful registration
    logger.info(`User registered successfully: ${email}`);

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

  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', loginValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { email, password } = req.body;

    // Find user with business info
    const user = await prisma.user.findUnique({
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
      throw new UnauthorizedError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    if (!user.business.isActive) {
      throw new UnauthorizedError('Business account is deactivated');
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(
      user.id,
      user.email,
      user.role,
      user.businessId
    );

    // Log successful login
    logger.info(`User logged in successfully: ${email}`);

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

  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token required');
    }

    // Verify refresh token
    const payload = jwt.verify(refreshToken, config.jwt.secret) as any;

    // Get user data
    const user = await prisma.user.findFirst({
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
      throw new UnauthorizedError('User not found or inactive');
    }

    // Generate new tokens
    const tokens = generateTokens(
      user.id,
      user.email,
      user.role,
      user.businessId
    );

    res.json({
      message: 'Token refreshed successfully',
      ...tokens
    });

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Refresh token expired'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid refresh token'));
    }
    next(error);
  }
});

// Get current user profile
router.get('/profile', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
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
      throw new NotFoundError('User not found');
    }

    res.json({
      user,
      business: user.business
    });

  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', authMiddleware, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('phone').optional().isMobilePhone('any').withMessage('Valid phone number required')
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { firstName, lastName, phone } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
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

  } catch (error) {
    next(error);
  }
});

// Update password
router.put('/password', authMiddleware, updatePasswordValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { currentPassword, newPassword } = req.body;

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id }
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword }
    });

    logger.info(`Password updated for user: ${user.email}`);

    res.json({
      message: 'Password updated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Logout (client-side token invalidation)
router.post('/logout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // In a more sophisticated implementation, you might want to blacklist tokens
    // For now, we'll just log the logout event
    logger.info(`User logged out: ${req.user!.email}`);

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    next(error);
  }
});

// Request password reset
router.post('/forgot-password', resetPasswordValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', errors.array());
    }

    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Don't reveal whether user exists or not
    res.json({
      message: 'If an account with this email exists, a password reset link has been sent'
    });

    if (user) {
      // TODO: Implement email service for password reset
      // For now, just log the request
      logger.info(`Password reset requested for user: ${email}`);
    }

  } catch (error) {
    next(error);
  }
});

export { router as authRoutes }; 