import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  // Generate unique request ID
  const id = req.headers['x-request-id'] as string || uuidv4();
  
  // Add to request object
  req.requestId = id;
  
  // Add to response headers
  res.set('X-Request-ID', id);
  
  next();
}; 