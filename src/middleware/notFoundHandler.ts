import { Request, Response } from 'express';
import { NotFoundError } from '@/middleware/errorHandler';

export const notFoundHandler = (req: Request, res: Response) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  
  res.status(error.statusCode).json({
    error: {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    }
  });
}; 