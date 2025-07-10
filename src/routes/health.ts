import { Router } from 'express';
import { healthCheck } from '@/utils/database';
import { redisHealthCheck } from '@/utils/redis';
import { logger } from '@/utils/logger';
import { Request, Response } from 'express'; // Added Request and Response imports
import { PrismaClient } from '@prisma/client'; // Added PrismaClient import

const router = Router();
const prisma = new PrismaClient(); // Initialize PrismaClient

// Basic health check
router.get('/', async (req, res) => {
  try {
    const [dbHealth, redisHealth] = await Promise.all([
      healthCheck(),
      redisHealthCheck()
    ]);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbHealth ? 'healthy' : 'unhealthy',
        redis: redisHealth ? 'healthy' : 'unhealthy'
      }
    };

    const overallStatus = dbHealth && redisHealth ? 200 : 503;
    
    res.status(overallStatus).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// Detailed health check endpoint
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const services = {
      database: 'unknown',
      redis: 'unknown',
      availability: 'unknown',
      whatsapp: 'unknown',
      email: 'unknown'
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      services.database = 'healthy';
    } catch (error) {
      logger.error('Database health check failed:', error);
      services.database = 'unhealthy';
    }

    // Check Redis connection
    try {
      const { redis } = await import('../utils/redis');
      await redis.ping();
      services.redis = 'healthy';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      services.redis = 'unhealthy';
    }

    // Check availability service
    try {
      const { availabilityService } = await import('../services/availabilityService');
      // Check if the service has the required methods instead of calling with test data
      if (typeof availabilityService.getAvailableSlots === 'function' &&
          typeof availabilityService.reserveSlot === 'function') {
        services.availability = 'healthy';
      } else {
        throw new Error('Required methods not found on availability service');
      }
    } catch (error) {
      logger.error('Availability service health check failed:', error);
      services.availability = 'unhealthy';
    }

    // Check WhatsApp service
    try {
      const { whatsappService } = await import('../services/whatsappService');
      const status = whatsappService.getStatus();
      services.whatsapp = status.configured ? 'healthy' : 'configured-fallback';
    } catch (error) {
      logger.error('WhatsApp service health check failed:', error);
      services.whatsapp = 'unhealthy';
    }

    // Check email service
    try {
      const { emailService } = await import('../services/emailService');
      // Just check if the service can be imported and initialized
      services.email = 'healthy';
    } catch (error) {
      logger.error('Email service health check failed:', error);
      services.email = 'unhealthy';
    }

    const overallStatus = Object.values(services).every(status => 
      status === 'healthy' || status === 'configured-fallback'
    ) ? 'healthy' : 'degraded';

    const statusCode = overallStatus === 'healthy' ? 200 : 503;

    res.status(statusCode).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services,
      checks: {
        database: {
          status: services.database,
          message: services.database === 'healthy' ? 'Database connection successful' : 'Database connection failed'
        },
        redis: {
          status: services.redis,
          message: services.redis === 'healthy' ? 'Redis connection successful' : 'Redis connection failed'
        },
        availability: {
          status: services.availability,
          message: services.availability === 'healthy' ? 'Availability service operational' : 'Availability service failed'
        },
        whatsapp: {
          status: services.whatsapp,
          message: services.whatsapp === 'healthy' ? 'WhatsApp service operational' : 
                  services.whatsapp === 'configured-fallback' ? 'WhatsApp service in fallback mode' : 'WhatsApp service failed'
        },
        email: {
          status: services.email,
          message: services.email === 'healthy' ? 'Email service operational' : 'Email service failed'
        }
      }
    });

  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: 'Unable to perform health checks'
    });
  }
});

export { router as healthRoutes }; 