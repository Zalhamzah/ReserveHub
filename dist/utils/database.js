"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.healthCheck = healthCheck;
exports.withTransaction = withTransaction;
exports.getConnectionInfo = getConnectionInfo;
const client_1 = require("@prisma/client");
const logger_1 = require("@/utils/logger");
// Create Prisma client instance
const prisma = new client_1.PrismaClient({
    log: ['query', 'error', 'info', 'warn'],
});
exports.prisma = prisma;
// Health check method
async function healthCheck() {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch (error) {
        logger_1.logger.error('Database health check failed:', error);
        return false;
    }
}
// Check if error is retryable
function isRetryableError(error) {
    const retryableErrors = [
        'P2034', // Transaction conflict
        'P2037', // Too many database connections
        'P2024', // Timed out fetching a new connection
        'P2025' // Record not found (might be due to concurrent modification)
    ];
    return retryableErrors.some(code => error.code === code);
}
// Delay helper
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Transaction helper with retry logic
async function withTransaction(fn, maxRetries = 3) {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await prisma.$transaction(fn);
        }
        catch (error) {
            lastError = error;
            // Check if it's a retryable error
            if (isRetryableError(error)) {
                logger_1.logger.warn(`Transaction failed, retrying... (${i + 1}/${maxRetries})`, error);
                await delay(Math.pow(2, i) * 1000); // Exponential backoff
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}
// Connection pool monitoring
async function getConnectionInfo() {
    try {
        const result = await prisma.$queryRaw `
      SELECT 
        count(*) as total_connections,
        sum(case when state = 'active' then 1 else 0 end) as active_connections,
        sum(case when state = 'idle' then 1 else 0 end) as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
        return result;
    }
    catch (error) {
        logger_1.logger.error('Failed to get connection info:', error);
        return null;
    }
}
// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=database.js.map