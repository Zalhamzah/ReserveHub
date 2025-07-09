import winston from 'winston';
declare const logger: winston.Logger;
interface RequestLogData {
    method: string;
    url: string;
    userAgent?: string;
    ip?: string;
    userId?: string;
    duration?: number;
    statusCode?: number;
    requestId?: string;
}
declare const logRequest: (data: RequestLogData) => void;
declare const logDatabase: (query: string, duration: number, error?: Error) => void;
declare const logBusinessEvent: (event: string, data: Record<string, any>) => void;
declare const logSecurity: (event: string, data: Record<string, any>) => void;
declare const logAudit: (action: string, data: Record<string, any>) => void;
export { logger, logRequest, logDatabase, logBusinessEvent, logSecurity, logAudit };
//# sourceMappingURL=logger.d.ts.map