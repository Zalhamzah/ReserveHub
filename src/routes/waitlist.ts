import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware } from '@/middleware/auth';
import { waitlistService } from '@/services/waitlistService';
import { logger } from '@/utils/logger';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
        details: errors.array(),
        validationErrors: errors.array()
      }
    });
  }
  next();
};

// GET /waitlist - Get waitlist for business
router.get('/', [
  query('businessId').isString().notEmpty().withMessage('Business ID is required'),
  query('locationId').optional().isString().withMessage('Location ID must be a string'),
  query('status').optional().isIn(['WAITING', 'SEATED', 'LEFT']).withMessage('Invalid status'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('minPartySize').optional().isInt({ min: 1 }).withMessage('minPartySize must be a positive integer'),
  query('maxPartySize').optional().isInt({ min: 1 }).withMessage('maxPartySize must be a positive integer'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const {
      businessId,
      locationId,
      status,
      page = 1,
      limit = 10,
      minPartySize,
      maxPartySize,
      dateFrom,
      dateTo
    } = req.query;

    const filters = {
      businessId,
      locationId,
      status,
      minPartySize: minPartySize ? parseInt(minPartySize) : undefined,
      maxPartySize: maxPartySize ? parseInt(maxPartySize) : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined
    };

    const result = await waitlistService.getWaitlistByBusiness(filters, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting waitlist:', error);
    throw error;
  }
});

// GET /waitlist/stats - Get waitlist statistics
router.get('/stats', [
  query('businessId').isString().notEmpty().withMessage('Business ID is required'),
  query('locationId').optional().isString().withMessage('Location ID must be a string'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const { businessId, locationId } = req.query;
    const stats = await waitlistService.getWaitlistStats(businessId, locationId);
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting waitlist stats:', error);
    throw error;
  }
});

// GET /waitlist/customer/:customerId - Get customer's waitlist position
router.get('/customer/:customerId', [
  param('customerId').isString().notEmpty().withMessage('Customer ID is required'),
  query('businessId').isString().notEmpty().withMessage('Business ID is required'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const { customerId } = req.params;
    const { businessId } = req.query;
    
    const position = await waitlistService.getCustomerPosition(customerId, businessId);
    
    res.json({
      success: true,
      data: position,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting customer position:', error);
    throw error;
  }
});

// POST /waitlist - Add customer to waitlist
router.post('/', [
  body('customerId').isString().notEmpty().withMessage('Customer ID is required'),
  body('businessId').isString().notEmpty().withMessage('Business ID is required'),
  body('locationId').optional().isString().withMessage('Location ID must be a string'),
  body('partySize').isInt({ min: 1, max: 20 }).withMessage('Party size must be between 1 and 20'),
  body('preferredTime').optional().isISO8601().withMessage('Invalid date format'),
  body('specialRequests').optional().isString().isLength({ max: 500 }).withMessage('Special requests must be less than 500 characters'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const waitlistData = {
      ...req.body,
      preferredTime: req.body.preferredTime ? new Date(req.body.preferredTime) : undefined
    };
    
    const entry = await waitlistService.addToWaitlist(waitlistData);
    
    res.status(201).json({
      success: true,
      data: entry,
      message: 'Customer added to waitlist successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error adding to waitlist:', error);
    throw error;
  }
});

// PUT /waitlist/:id - Update waitlist entry
router.put('/:id', [
  param('id').isString().notEmpty().withMessage('Waitlist entry ID is required'),
  body('businessId').isString().notEmpty().withMessage('Business ID is required'),
  body('estimatedWaitTime').optional().isInt({ min: 0 }).withMessage('Estimated wait time must be a non-negative integer'),
  body('specialRequests').optional().isString().isLength({ max: 500 }).withMessage('Special requests must be less than 500 characters'),
  body('status').optional().isIn(['WAITING', 'SEATED', 'LEFT']).withMessage('Invalid status'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { businessId, ...updateData } = req.body;
    
    const entry = await waitlistService.updateWaitlistEntry(id, businessId, updateData);
    
    res.json({
      success: true,
      data: entry,
      message: 'Waitlist entry updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating waitlist entry:', error);
    throw error;
  }
});

// DELETE /waitlist/:id - Remove customer from waitlist
router.delete('/:id', [
  param('id').isString().notEmpty().withMessage('Waitlist entry ID is required'),
  query('businessId').isString().notEmpty().withMessage('Business ID is required'),
  query('reason').optional().isIn(['SEATED', 'LEFT']).withMessage('Reason must be SEATED or LEFT'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { businessId, reason = 'LEFT' } = req.query;
    
    await waitlistService.removeFromWaitlist(id, businessId, reason);
    
    res.json({
      success: true,
      message: 'Customer removed from waitlist successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error removing from waitlist:', error);
    throw error;
  }
});

// POST /waitlist/notify-next - Notify next customer(s) that table is ready
router.post('/notify-next', [
  body('businessId').isString().notEmpty().withMessage('Business ID is required'),
  body('locationId').optional().isString().withMessage('Location ID must be a string'),
  body('count').optional().isInt({ min: 1, max: 5 }).withMessage('Count must be between 1 and 5'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const { businessId, locationId, count = 1 } = req.body;
    
    await waitlistService.notifyNext(businessId, locationId, count);
    
    res.json({
      success: true,
      message: `Notified ${count} customer(s) successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error notifying next customers:', error);
    throw error;
  }
});

// POST /waitlist/update-estimates - Update wait time estimates
router.post('/update-estimates', [
  body('businessId').isString().notEmpty().withMessage('Business ID is required'),
  body('locationId').optional().isString().withMessage('Location ID must be a string'),
  validateRequest
], async (req: any, res: any) => {
  try {
    const { businessId, locationId } = req.body;
    
    await waitlistService.updateWaitTimeEstimates(businessId, locationId);
    
    res.json({
      success: true,
      message: 'Wait time estimates updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating wait time estimates:', error);
    throw error;
  }
});

export { router as waitlistRoutes }; 