import { PrismaClient } from '@prisma/client';
declare const prisma: PrismaClient<{
    log: ("info" | "error" | "warn" | "query")[];
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
declare function healthCheck(): Promise<boolean>;
declare function withTransaction<T>(fn: (prisma: any) => Promise<T>, maxRetries?: number): Promise<T>;
declare function getConnectionInfo(): Promise<unknown>;
export { prisma, healthCheck, withTransaction, getConnectionInfo };
export type { PrismaClient } from '@prisma/client';
//# sourceMappingURL=database.d.ts.map