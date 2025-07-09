"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
    apiVersion: process.env.API_VERSION || 'v1',
    database: {
        url: process.env.DATABASE_URL || 'postgresql://localhost:5432/connectreserve'
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        password: process.env.REDIS_PASSWORD
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        credentials: process.env.CORS_CREDENTIALS === 'true'
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
    },
    payment: {
        stripe: {
            secretKey: process.env.STRIPE_SECRET_KEY || '',
            publicKey: process.env.STRIPE_PUBLIC_KEY || '',
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
        },
        square: {
            accessToken: process.env.SQUARE_ACCESS_TOKEN || '',
            applicationId: process.env.SQUARE_APPLICATION_ID || '',
            environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
            webhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || ''
        }
    },
    notifications: {
        twilio: {
            accountSid: process.env.TWILIO_ACCOUNT_SID || '',
            authToken: process.env.TWILIO_AUTH_TOKEN || '',
            phoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
        },
        email: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            user: process.env.SMTP_USER || '',
            password: process.env.SMTP_PASSWORD || '',
            from: process.env.EMAIL_FROM || 'noreply@connectreserve.com'
        }
    },
    pos: {
        toast: {
            apiUrl: process.env.TOAST_API_URL || 'https://toast-api-server',
            clientId: process.env.TOAST_CLIENT_ID || '',
            clientSecret: process.env.TOAST_CLIENT_SECRET || ''
        },
        lightspeed: {
            apiUrl: process.env.LIGHTSPEED_API_URL || 'https://api.lightspeedhq.com',
            clientId: process.env.LIGHTSPEED_CLIENT_ID || '',
            clientSecret: process.env.LIGHTSPEED_CLIENT_SECRET || ''
        },
        micros: {
            apiUrl: process.env.MICROS_API_URL || 'https://api.oracle.com/micros',
            clientId: process.env.MICROS_CLIENT_ID || '',
            clientSecret: process.env.MICROS_CLIENT_SECRET || ''
        }
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: process.env.LOG_FILE || 'logs/app.log'
    },
    upload: {
        maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '5242880', 10),
        allowedTypes: process.env.UPLOAD_ALLOWED_TYPES?.split(',') || [
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/pdf'
        ]
    },
    business: {
        defaultTimezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',
        defaultCurrency: process.env.DEFAULT_CURRENCY || 'USD',
        defaultBookingDuration: parseInt(process.env.DEFAULT_BOOKING_DURATION || '90', 10),
        maxPartySize: parseInt(process.env.MAX_PARTY_SIZE || '20', 10),
        advanceBookingDays: parseInt(process.env.ADVANCE_BOOKING_DAYS || '60', 10)
    }
};
exports.config = config;
// Validate required environment variables
const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET'
];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}
//# sourceMappingURL=config.js.map