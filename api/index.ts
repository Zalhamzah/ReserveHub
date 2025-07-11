import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from '../src/config/config';
import { logger } from '../src/utils/logger';
import { errorHandler } from '../src/middleware/errorHandler';
import { notFoundHandler } from '../src/middleware/notFoundHandler';
import { requestId } from '../src/middleware/requestId';
import { routes } from '../src/routes';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from '../src/docs/swagger';
import { prisma } from '../src/utils/database';
import { emailService } from '../src/services/emailService';
import { whatsappService } from '../src/services/whatsappService';

const app = express();

// Services are already initialized as singletons
logger.info('Services loaded for Vercel deployment');

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.stripe.com'],
      manifestSrc: ["'self'"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID']
}));

// Rate limiting - reduced for serverless
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max * 2, // More lenient for serverless
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: config.rateLimit.windowMs / 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: config.rateLimit.windowMs / 1000
    });
  }
});

app.use(limiter);

// Request logging - simplified for serverless
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Response compression
app.use(compression());

// Request ID middleware
app.use(requestId);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint with database connectivity test
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.nodeEnv,
      services: {
        database: 'healthy',
        email: emailService ? 'healthy' : 'disabled',
        whatsapp: whatsappService ? 'healthy' : 'disabled'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    });
  }
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ReserveHub API Documentation'
}));

// API JSON specification
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API routes
app.use(`/api/${config.apiVersion}`, routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Serverless function handler
export default async (req: any, res: any) => {
  try {
    // Ensure database connection is active
    if (!prisma) {
      throw new Error('Database not initialized');
    }
    
    return app(req, res);
  } catch (error) {
    logger.error('Serverless function error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Function initialization failed'
    });
  }
}; 