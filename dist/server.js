"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("@/config/config");
const logger_1 = require("@/utils/logger");
const errorHandler_1 = require("@/middleware/errorHandler");
const notFoundHandler_1 = require("@/middleware/notFoundHandler");
const requestId_1 = require("@/middleware/requestId");
const database_1 = require("@/utils/database");
const redis_1 = require("@/utils/redis");
const websocket_1 = require("@/utils/websocket");
const routes_1 = require("@/routes");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("@/docs/swagger");
const app = (0, express_1.default)();
// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:']
        }
    }
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: config_1.config.cors.origin,
    credentials: config_1.config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: config_1.config.rateLimit.windowMs,
    max: config_1.config.rateLimit.max,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: config_1.config.rateLimit.windowMs / 1000
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger_1.logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Too many requests from this IP, please try again later.',
            retryAfter: config_1.config.rateLimit.windowMs / 1000
        });
    }
});
app.use(limiter);
// Request logging
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => {
            logger_1.logger.info(message.trim());
        }
    }
}));
// Body parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Response compression
app.use((0, compression_1.default)());
// Request ID middleware
app.use(requestId_1.requestId);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config_1.config.nodeEnv
    });
});
// API Documentation
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'ReserveHub API Documentation'
}));
// API JSON specification
app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swagger_1.swaggerSpec);
});
// API routes
app.use(`/api/${config_1.config.apiVersion}`, routes_1.routes);
// 404 handler
app.use(notFoundHandler_1.notFoundHandler);
// Global error handler
app.use(errorHandler_1.errorHandler);
// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    logger_1.logger.info(`Received ${signal}, shutting down gracefully...`);
    // Close server
    server.close(() => {
        logger_1.logger.info('HTTP server closed');
    });
    // Close database connection
    try {
        await database_1.prisma.$disconnect();
        logger_1.logger.info('Database connection closed');
    }
    catch (error) {
        logger_1.logger.error('Error closing database connection:', error);
    }
    // Close Redis connection
    try {
        await redis_1.redis.quit();
        logger_1.logger.info('Redis connection closed');
    }
    catch (error) {
        logger_1.logger.error('Error closing Redis connection:', error);
    }
    process.exit(0);
};
// Start server
const server = app.listen(config_1.config.port, config_1.config.host, () => {
    logger_1.logger.info(`ConnectReserve API server running on ${config_1.config.host}:${config_1.config.port}`);
    logger_1.logger.info(`Environment: ${config_1.config.nodeEnv}`);
    logger_1.logger.info(`API Version: ${config_1.config.apiVersion}`);
});
// Initialize WebSocket
(0, websocket_1.initializeWebSocket)(server);
// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    process.exit(1);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=server.js.map