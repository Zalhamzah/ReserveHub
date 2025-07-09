import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            requestId: string;
        }
    }
}
export declare const requestId: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=requestId.d.ts.map