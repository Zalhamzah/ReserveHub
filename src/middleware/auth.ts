import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@/config/config';
import { UnauthorizedError, ForbiddenError } from '@/middleware/errorHandler';
import { prisma } from '@/utils/database';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        businessId: string;
      };
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  businessId: string;
  iat: number;
  exp: number;
}

// Extract token from request
const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check for token in query params (for WebSocket connections)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  
  return null;
};

// Verify JWT token
const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Authentication failed');
  }
};

// Main authentication middleware
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new UnauthorizedError('Access token required');
    }
    
    const payload = verifyToken(token);
    
    // Verify user still exists and is active
    const user = await prisma.user.findFirst({
      where: {
        id: payload.userId,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        role: true,
        businessId: true,
        isActive: true
      }
    });
    
    if (!user) {
      throw new UnauthorizedError('User not found or inactive');
    }
    
    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      businessId: user.businessId
    };
    
    next();
  } catch (error) {
    next(error);
  }
};

// Optional authentication middleware (doesn't throw if no token)
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }
    
    const payload = verifyToken(token);
    
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
    
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        businessId: user.businessId
      };
    }
    
    next();
  } catch (error) {
    // Don't throw error for optional auth, just continue
    next();
  }
};

// Role-based authorization middleware
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }
    
    next();
  };
};

// Business ownership middleware
export const requireBusinessAccess = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }
  
  const businessId = req.params.businessId || req.body.businessId;
  
  if (businessId && businessId !== req.user.businessId) {
    // Allow super admins to access any business
    if (req.user.role !== 'SUPER_ADMIN') {
      return next(new ForbiddenError('Access denied to this business'));
    }
  }
  
  next();
}; 