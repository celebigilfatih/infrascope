/**
 * Prisma Client singleton
 * Ensures single instance across the application
 */

import { PrismaClient } from '@prisma/client';
import { unstable_noStore as noStore } from 'next/cache';

/**
 * Build DATABASE_URL with connection pool parameters.
 * Appends connection_limit and pool_timeout if not already present in the URL.
 */
function getDatabaseUrlWithPoolConfig(): string {
  // Build workers import route modules without an installation database.
  // This syntactic URL is build-only; query middleware opts routes out of prerendering.
  let url = process.env.DATABASE_URL || (process.env.INFRASCOPE_BUILD === '1'
    ? 'postgresql://build:build@127.0.0.1:1/build?connect_timeout=1'
    : undefined);
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

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrlWithPoolConfig(),
      },
    },
    // Disable query logging in all environments - it adds significant I/O overhead
    // Enable temporarily with: log: ['query', 'error', 'warn']
    log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['query', 'error'] : ['error'],
  });
  // Customer data is request-time data. Never bake it (or a DB error) into an image.
  // Explicit service-level caches remain responsible for their own lifetimes.
  client.$use(async (params, next) => {
    noStore();
    return next(params);
  });
  return client;
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
