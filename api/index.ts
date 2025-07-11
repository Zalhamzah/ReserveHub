import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../src/config/config';
import { logger } from '../src/utils/logger';
import { errorHandler } from '../src/middleware/errorHandler';
import { requestId } from '../src/middleware/requestId';

// Import only essential routes for basic booking functionality
import { bookingRoutes } from '../src/routes/bookings';
import { healthRoutes } from '../src/routes/health';
import { businessRoutes } from '../src/routes/business';
import servicesRoutes from '../src/routes/services';

const app = express();

// CORS configuration - allow all origins for testing
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id']
}));

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestId);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check route (essential)
app.use('/api/v1/health', healthRoutes);

// Core booking routes
app.use('/api/v1/bookings', bookingRoutes);

// Business info routes
app.use('/api/v1/business', businessRoutes);

// Services routes (for pet shop, etc.)
app.use('/api/v1/services', servicesRoutes);

// Default route for frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use(errorHandler);

// For Vercel serverless functions
export default app;

// For local development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`🚀 ReserveHub API server running on localhost:${PORT}`);
    logger.info(`📱 Environment: ${config.nodeEnv}`);
    logger.info(`🔗 Frontend: http://localhost:${PORT}`);
  });
} 