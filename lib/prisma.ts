/**
 * Prisma Client singleton
 * Ensures single instance across the application
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Disable query logging in all environments - it adds significant I/O overhead
    // Enable temporarily with: log: ['query', 'error', 'warn']
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
