import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string | undefined;
  details?: any;
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;
  code?: string | undefined;
  details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code || undefined;
    this.details = details || undefined;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Create common error types
export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, true, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, true, 'FORBIDDEN');
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Conflict') {
    super(message, 409, true, 'CONFLICT');
  }
}

export class TooManyRequestsError extends ApiError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, true, 'TOO_MANY_REQUESTS');
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, false, 'INTERNAL_SERVER_ERROR');
  }
}

// Helper function to determine if error is operational
const isOperationalError = (error: any): boolean => {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  
  // Check for common operational errors
  const operationalErrors = [
    'CastError',
    'ValidationError',
    'MongoError',
    'PrismaClientKnownRequestError',
    'PrismaClientValidationError'
  ];
  
  return operationalErrors.includes(error.constructor.name);
};

// Helper function to format error response
const formatErrorResponse = (error: AppError, isDevelopment: boolean) => {
  const response: any = {
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString()
    }
  };
  
  // Add additional details in development
  if (isDevelopment) {
    response.error.stack = error.stack;
    response.error.details = error.details;
  }
  
  // Add validation details if available
  if (error.details && error.statusCode === 400) {
    response.error.validationErrors = error.details;
  }
  
  return response;
};

// Helper function to handle database errors
const handleDatabaseError = (error: any): AppError => {
  if (error.code === 'P2002') {
    return new ConflictError('Resource already exists');
  }
  
  if (error.code === 'P2025') {
    return new NotFoundError('Resource not found');
  }
  
  if (error.code === 'P2014') {
    return new ValidationError('Invalid data provided');
  }
  
  if (error.code === 'P2003') {
    return new ValidationError('Foreign key constraint failed');
  }
  
  return new InternalServerError('Database error occurred');
};

// Helper function to handle JWT errors
const handleJWTError = (error: any): AppError => {
  if (error.name === 'JsonWebTokenError') {
    return new UnauthorizedError('Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return new UnauthorizedError('Token expired');
  }
  
  return new UnauthorizedError('Authentication failed');
};

// Main error handler middleware
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let err: AppError = error;
  
  // Handle different error types
  if (error.name === 'PrismaClientKnownRequestError') {
    err = handleDatabaseError(error);
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    err = handleJWTError(error);
  } else if (error.name === 'ValidationError') {
    err = new ValidationError(error.message, error.details);
  } else if (error.name === 'CastError') {
    err = new ValidationError(`Invalid ${error.path}: ${error.value}`);
  } else if (error.code === 11000) {
    err = new ConflictError('Duplicate field value');
  } else if (!isOperationalError(error)) {
    err = new InternalServerError();
  }
  
  // Set default status code if not set
  if (!err.statusCode) {
    err.statusCode = 500;
  }
  
  // Log error
  const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]('Error handled:', {
    error: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: (req as any).user?.id,
    requestId: (req as any).requestId
  });
  
  // Send error response
  res.status(err.statusCode).json(
    formatErrorResponse(err, process.env.NODE_ENV === 'development')
  );
};

// Async error handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}; 