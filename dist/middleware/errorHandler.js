"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.errorHandler = exports.InternalServerError = exports.TooManyRequestsError = exports.ConflictError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = exports.ApiError = void 0;
const logger_1 = require("@/utils/logger");
class ApiError extends Error {
    statusCode;
    isOperational;
    code;
    details;
    constructor(message, statusCode = 500, isOperational = true, code, details) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.code = code || undefined;
        this.details = details || undefined;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.ApiError = ApiError;
// Create common error types
class ValidationError extends ApiError {
    constructor(message, details) {
        super(message, 400, true, 'VALIDATION_ERROR', details);
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends ApiError {
    constructor(message = 'Resource not found') {
        super(message, 404, true, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized') {
        super(message, 401, true, 'UNAUTHORIZED');
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden') {
        super(message, 403, true, 'FORBIDDEN');
    }
}
exports.ForbiddenError = ForbiddenError;
class ConflictError extends ApiError {
    constructor(message = 'Conflict') {
        super(message, 409, true, 'CONFLICT');
    }
}
exports.ConflictError = ConflictError;
class TooManyRequestsError extends ApiError {
    constructor(message = 'Too many requests') {
        super(message, 429, true, 'TOO_MANY_REQUESTS');
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
class InternalServerError extends ApiError {
    constructor(message = 'Internal server error') {
        super(message, 500, false, 'INTERNAL_SERVER_ERROR');
    }
}
exports.InternalServerError = InternalServerError;
// Helper function to determine if error is operational
const isOperationalError = (error) => {
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
const formatErrorResponse = (error, isDevelopment) => {
    const response = {
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
const handleDatabaseError = (error) => {
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
const handleJWTError = (error) => {
    if (error.name === 'JsonWebTokenError') {
        return new UnauthorizedError('Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
        return new UnauthorizedError('Token expired');
    }
    return new UnauthorizedError('Authentication failed');
};
// Main error handler middleware
const errorHandler = (error, req, res, next) => {
    let err = error;
    // Handle different error types
    if (error.name === 'PrismaClientKnownRequestError') {
        err = handleDatabaseError(error);
    }
    else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        err = handleJWTError(error);
    }
    else if (error.name === 'ValidationError') {
        err = new ValidationError(error.message, error.details);
    }
    else if (error.name === 'CastError') {
        err = new ValidationError(`Invalid ${error.path}: ${error.value}`);
    }
    else if (error.code === 11000) {
        err = new ConflictError('Duplicate field value');
    }
    else if (!isOperationalError(error)) {
        err = new InternalServerError();
    }
    // Set default status code if not set
    if (!err.statusCode) {
        err.statusCode = 500;
    }
    // Log error
    const logLevel = err.statusCode >= 500 ? 'error' : 'warn';
    logger_1.logger[logLevel]('Error handled:', {
        error: err.message,
        code: err.code,
        statusCode: err.statusCode,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        requestId: req.requestId
    });
    // Send error response
    res.status(err.statusCode).json(formatErrorResponse(err, process.env.NODE_ENV === 'development'));
};
exports.errorHandler = errorHandler;
// Async error handler wrapper
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
//# sourceMappingURL=errorHandler.js.map