/**
 * Prisma Client singleton
 * Ensures single instance across the application
 */

import { PrismaClient } from '@prisma/client';

/**
 * Build DATABASE_URL with connection pool parameters.
 * Appends connection_limit and pool_timeout if not already present in the URL.
 */
function getDatabaseUrlWithPoolConfig(): string {
  let url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const connectionLimit = process.env.DATABASE_CONNECTION_LIMIT || '10';
  const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || '30';

  // Only append params if they're not already in the URL
  if (!url.includes('connection_limit=')) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}connection_limit=${connectionLimit}`;
  }
  if (!url.includes('pool_timeout=')) {
    url = `${url}&pool_timeout=${poolTimeout}`;
  }

  return url;
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrlWithPoolConfig(),
      },
    },
    // Disable query logging in all environments - it adds significant I/O overhead
    // Enable temporarily with: log: ['query', 'error', 'warn']
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
