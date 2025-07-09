import { Router } from 'express';
import { authRoutes } from './auth';
import { businessRoutes } from './business';
import { customerRoutes } from './customers';
import { tableRoutes } from './tables';
import { bookingRoutes } from './bookings';
import { waitlistRoutes } from './waitlist';
import { notificationRoutes } from './notifications';
import { paymentRoutes } from './payments';
import { analyticsRoutes } from './analytics';
import { healthRoutes } from './health';
import { adminRoutes } from './admin';
import whatsappRoutes from './whatsapp';

const router = Router();

// Health check - should be first
router.use('/health', healthRoutes);

// Authentication routes
router.use('/auth', authRoutes);

// Business management routes
router.use('/business', businessRoutes);
router.use('/customers', customerRoutes);
router.use('/tables', tableRoutes);
router.use('/bookings', bookingRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/notifications', notificationRoutes);
router.use('/payments', paymentRoutes);
router.use('/analytics', analyticsRoutes);

// WhatsApp routes
router.use('/whatsapp', whatsappRoutes);

// Admin routes
router.use('/admin', adminRoutes);

// Merchant Dashboard Route
router.get('/dashboard', (req, res) => {
    res.sendFile('dashboard.html', { root: 'public' });
});

// Admin Dashboard Route (alias)
router.get('/admin', (req, res) => {
    res.sendFile('dashboard.html', { root: 'public' });
});

export { router as routes }; 