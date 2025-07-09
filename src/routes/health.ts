import { Router } from 'express';
import { healthCheck } from '@/utils/database';
import { redisHealthCheck } from '@/utils/redis';
import { logger } from '@/utils/logger';

const router = Router();

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

// Detailed health check
router.get('/detailed', async (req, res) => {
  try {
    const startTime = Date.now();
    
    const [dbHealth, redisHealth] = await Promise.all([
      healthCheck(),
      redisHealthCheck()
    ]);

    const responseTime = Date.now() - startTime;

    res.json({
      status: dbHealth && redisHealth ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      memory: process.memoryUsage(),
      services: {
        database: {
          status: dbHealth ? 'healthy' : 'unhealthy',
          responseTime: `${responseTime}ms`
        },
        redis: {
          status: redisHealth ? 'healthy' : 'unhealthy',
          responseTime: `${responseTime}ms`
        }
      }
    });
  } catch (error) {
    logger.error('Detailed health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

export { router as healthRoutes }; 