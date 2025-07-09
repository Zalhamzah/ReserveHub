"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = exports.logSecurity = exports.logBusinessEvent = exports.logDatabase = exports.logRequest = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const config_1 = require("@/config/config");
// Define log levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};
// Create logs directory if it doesn't exist
const logsDir = path_1.default.dirname(config_1.config.logging.file);
// Custom format for console output
const consoleFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
}));
// Custom format for file output
const fileFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
// Create transports
const transports = [];
// Console transport for development
if (config_1.config.nodeEnv !== 'production') {
    transports.push(new winston_1.default.transports.Console({
        format: consoleFormat,
        level: config_1.config.logging.level
    }));
}
// File transport for all environments
transports.push(new winston_1.default.transports.File({
    filename: config_1.config.logging.file,
    format: fileFormat,
    level: config_1.config.logging.level,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
    tailable: true
}));
// Error-specific file transport
transports.push(new winston_1.default.transports.File({
    filename: path_1.default.join(logsDir, 'error.log'),
    format: fileFormat,
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    tailable: true
}));
// Create logger instance
const logger = winston_1.default.createLogger({
    levels: logLevels,
    level: config_1.config.logging.level,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports,
    exitOnError: false
});
exports.logger = logger;
const logRequest = (data) => {
    const logData = {
        type: 'request',
        ...data
    };
    if (data.statusCode && data.statusCode >= 400) {
        logger.warn('HTTP Request Error', logData);
    }
    else {
        logger.info('HTTP Request', logData);
    }
};
exports.logRequest = logRequest;
// Add database logging helper
const logDatabase = (query, duration, error) => {
    const logData = {
        type: 'database',
        query,
        duration,
        error: error?.message
    };
    if (error) {
        logger.error('Database Error', logData);
    }
    else {
        logger.debug('Database Query', logData);
    }
};
exports.logDatabase = logDatabase;
// Add business event logging helper
const logBusinessEvent = (event, data) => {
    logger.info('Business Event', {
        type: 'business',
        event,
        ...data
    });
};
exports.logBusinessEvent = logBusinessEvent;
// Add security logging helper
const logSecurity = (event, data) => {
    logger.warn('Security Event', {
        type: 'security',
        event,
        ...data
    });
};
exports.logSecurity = logSecurity;
// Add audit logging helper
const logAudit = (action, data) => {
    logger.info('Audit Event', {
        type: 'audit',
        action,
        ...data
    });
};
exports.logAudit = logAudit;
//# sourceMappingURL=logger.js.map