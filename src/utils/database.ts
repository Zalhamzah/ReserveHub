import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

// Create Prisma client instance
const prisma = new PrismaClient({
  log: ['query', 'error', 'info', 'warn'],
});

// Health check method
async function healthCheck(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

// Database connection check for API endpoints
export const checkDatabaseConnection = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { success: true };
  } catch (error) {
    logger.error('Database connection check failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Database connection failed' 
    };
  }
};

// Check if error is retryable
function isRetryableError(error: any): boolean {
  const retryableErrors = [
    'P2034', // Transaction conflict
    'P2037', // Too many database connections
    'P2024', // Timed out fetching a new connection
    'P2025'  // Record not found (might be due to concurrent modification)
  ];
  
  return retryableErrors.some(code => error.code === code);
}

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Transaction helper with retry logic
async function withTransaction<T>(
  fn: (prisma: any) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await prisma.$transaction(fn);
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a retryable error
      if (isRetryableError(error)) {
        logger.warn(`Transaction failed, retrying... (${i + 1}/${maxRetries})`, error);
        await delay(Math.pow(2, i) * 1000); // Exponential backoff
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError!;
}

// Connection pool monitoring
async function getConnectionInfo() {
  try {
    const result = await prisma.$queryRaw`
      SELECT 
        count(*) as total_connections,
        sum(case when state = 'active' then 1 else 0 end) as active_connections,
        sum(case when state = 'idle' then 1 else 0 end) as idle_connections
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    return result;
  } catch (error) {
    logger.error('Failed to get connection info:', error);
    return null;
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { 
  prisma, 
  healthCheck, 
  withTransaction, 
  getConnectionInfo 
};
export type { PrismaClient } from '@prisma/client'; 