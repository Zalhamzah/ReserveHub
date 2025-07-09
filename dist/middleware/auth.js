"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireBusinessAccess = exports.requireRole = exports.optionalAuth = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("@/config/config");
const errorHandler_1 = require("@/middleware/errorHandler");
const database_1 = require("@/utils/database");
// Extract token from request
const extractToken = (req) => {
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
const verifyToken = (token) => {
    try {
        return jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            throw new errorHandler_1.UnauthorizedError('Token expired');
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            throw new errorHandler_1.UnauthorizedError('Invalid token');
        }
        throw new errorHandler_1.UnauthorizedError('Authentication failed');
    }
};
// Main authentication middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) {
            throw new errorHandler_1.UnauthorizedError('Access token required');
        }
        const payload = verifyToken(token);
        // Verify user still exists and is active
        const user = await database_1.prisma.user.findFirst({
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
            throw new errorHandler_1.UnauthorizedError('User not found or inactive');
        }
        // Add user to request object
        req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            businessId: user.businessId
        };
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.authMiddleware = authMiddleware;
// Optional authentication middleware (doesn't throw if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const token = extractToken(req);
        if (!token) {
            return next();
        }
        const payload = verifyToken(token);
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
        if (user) {
            req.user = {
                id: user.id,
                email: user.email,
                role: user.role,
                businessId: user.businessId
            };
        }
        next();
    }
    catch (error) {
        // Don't throw error for optional auth, just continue
        next();
    }
};
exports.optionalAuth = optionalAuth;
// Role-based authorization middleware
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return next(new errorHandler_1.UnauthorizedError('Authentication required'));
        }
        if (!roles.includes(req.user.role)) {
            return next(new errorHandler_1.ForbiddenError('Insufficient permissions'));
        }
        next();
    };
};
exports.requireRole = requireRole;
// Business ownership middleware
const requireBusinessAccess = (req, res, next) => {
    if (!req.user) {
        return next(new errorHandler_1.UnauthorizedError('Authentication required'));
    }
    const businessId = req.params.businessId || req.body.businessId;
    if (businessId && businessId !== req.user.businessId) {
        // Allow super admins to access any business
        if (req.user.role !== 'SUPER_ADMIN') {
            return next(new errorHandler_1.ForbiddenError('Access denied to this business'));
        }
    }
    next();
};
exports.requireBusinessAccess = requireBusinessAccess;
//# sourceMappingURL=auth.js.map