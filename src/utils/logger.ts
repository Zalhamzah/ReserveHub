import winston from 'winston';
import path from 'path';
import { config } from '@/config/config';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Create logs directory if it doesn't exist
const logsDir = path.dirname(config.logging.file);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level}]: ${stack || message}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports
const transports: winston.transport[] = [];

// Console transport for development
if (config.nodeEnv !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level
    })
  );
}

// File transport for all environments
transports.push(
  new winston.transports.File({
    filename: config.logging.file,
    format: fileFormat,
    level: config.logging.level,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
    tailable: true
  })
);

// Error-specific file transport
transports.push(
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    format: fileFormat,
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    tailable: true
  })
);

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
  exitOnError: false
});

// Add request logging helper
interface RequestLogData {
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
  userId?: string;
  duration?: number;
  statusCode?: number;
  requestId?: string;
}

const logRequest = (data: RequestLogData) => {
  const logData = {
    type: 'request',
    ...data
  };
  
  if (data.statusCode && data.statusCode >= 400) {
    logger.warn('HTTP Request Error', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Add database logging helper
const logDatabase = (query: string, duration: number, error?: Error) => {
  const logData = {
    type: 'database',
    query,
    duration,
    error: error?.message
  };
  
  if (error) {
    logger.error('Database Error', logData);
  } else {
    logger.debug('Database Query', logData);
  }
};

// Add business event logging helper
const logBusinessEvent = (event: string, data: Record<string, any>) => {
  logger.info('Business Event', {
    type: 'business',
    event,
    ...data
  });
};

// Add security logging helper
const logSecurity = (event: string, data: Record<string, any>) => {
  logger.warn('Security Event', {
    type: 'security',
    event,
    ...data
  });
};

// Add audit logging helper
const logAudit = (action: string, data: Record<string, any>) => {
  logger.info('Audit Event', {
    type: 'audit',
    action,
    ...data
  });
};

// Export logger and helpers
export {
  logger,
  logRequest,
  logDatabase,
  logBusinessEvent,
  logSecurity,
  logAudit
}; 