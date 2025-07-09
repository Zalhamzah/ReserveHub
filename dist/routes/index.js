"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routes = void 0;
const express_1 = require("express");
const auth_1 = require("@/routes/auth");
const bookings_1 = require("@/routes/bookings");
const customers_1 = require("@/routes/customers");
const business_1 = require("@/routes/business");
const tables_1 = require("@/routes/tables");
const waitlist_1 = require("@/routes/waitlist");
const payments_1 = require("@/routes/payments");
const notifications_1 = require("@/routes/notifications");
const analytics_1 = require("@/routes/analytics");
const health_1 = require("@/routes/health");
const router = (0, express_1.Router)();
exports.routes = router;
// Health check routes (no auth required)
router.use('/health', health_1.healthRoutes);
// Authentication routes (no auth required)
router.use('/auth', auth_1.authRoutes);
// Protected routes (auth required)
router.use('/bookings', bookings_1.bookingRoutes);
router.use('/customers', customers_1.customerRoutes);
router.use('/business', business_1.businessRoutes);
router.use('/tables', tables_1.tableRoutes);
router.use('/waitlist', waitlist_1.waitlistRoutes);
router.use('/payments', payments_1.paymentRoutes);
router.use('/notifications', notifications_1.notificationRoutes);
router.use('/analytics', analytics_1.analyticsRoutes);
//# sourceMappingURL=index.js.map