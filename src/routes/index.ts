import { Router } from 'express';
import { authRoutes } from '@/routes/auth';
import { bookingRoutes } from '@/routes/bookings';
import { customerRoutes } from '@/routes/customers';
import { businessRoutes } from '@/routes/business';
import { tableRoutes } from '@/routes/tables';
import { waitlistRoutes } from '@/routes/waitlist';
import { paymentRoutes } from '@/routes/payments';
import { notificationRoutes } from '@/routes/notifications';
import { analyticsRoutes } from '@/routes/analytics';
import { healthRoutes } from '@/routes/health';

const router = Router();

// Health check routes (no auth required)
router.use('/health', healthRoutes);

// Authentication routes (no auth required)
router.use('/auth', authRoutes);

// Protected routes (auth required)
router.use('/bookings', bookingRoutes);
router.use('/customers', customerRoutes);
router.use('/business', businessRoutes);
router.use('/tables', tableRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/analytics', analyticsRoutes);

export { router as routes }; 