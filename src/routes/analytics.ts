import { Router } from 'express';
const router = Router();
router.get('/', (req, res) => res.status(501).json({ message: 'Analytics routes coming soon' }));
export { router as analyticsRoutes }; 