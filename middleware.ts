import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessSync, type Resource, type Action } from '@/lib/auth/permissions';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isRateLimited, getClientIp, getRateLimitConfig } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('middleware');

// P0-8: Runtime TLS safety check
if (process.env.NODE_ENV === 'production' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  log.error('CRITICAL SECURITY: NODE_TLS_REJECT_UNAUTHORIZED=0 is set in production! TLS verification is disabled. Remove this setting immediately.');
}

// Map API route prefixes to resource names
const ROUTE_RESOURCE_MAP: Record<string, Resource> = {
  '/api/users': 'users',
  '/api/alarms': 'alarms',
  '/api/devices': 'devices',
  '/api/organizations': 'organizations',
  '/api/settings': 'settings',
  '/api/audit': 'audit',
  '/api/permissions': 'settings',
};

// Map HTTP methods to action types
const METHOD_ACTION_MAP: Record<string, Action> = {
  GET: 'read',
  POST: 'write',
  PATCH: 'write',
  PUT: 'write',
  DELETE: 'delete',
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/ routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // P1-12: Rate limiting — applies to ALL API routes including public ones
  const clientIp = getClientIp(request);
  const rateLimitConfig = getRateLimitConfig(pathname);
  const { limited, retryAfterMs } = isRateLimited(clientIp, rateLimitConfig);
  if (limited) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
      }
    );
  }

  // Skip public API routes (no auth required, but rate limiting already applied above)
  const publicRoutes = ['/api/auth/', '/api/health'];
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Find matching resource
  let resource: Resource | undefined;
  for (const [prefix, res] of Object.entries(ROUTE_RESOURCE_MAP)) {
    if (pathname.startsWith(prefix)) {
      resource = res;
      break;
    }
  }

  if (!resource) {
    // No permission mapping for this route - still require authentication
    // Previously this was allow-through, but unmapped routes should not bypass auth
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session expired or invalid' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // Verify session from httpOnly cookie (replaces spoofable x-user-role header)
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  const session = await verifySessionToken(token);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Session expired or invalid' },
      { status: 401 }
    );
  }

  const userRole = session.role.toUpperCase();
  const action = METHOD_ACTION_MAP[request.method];

  if (!action) {
    return NextResponse.next();
  }

  // Check permission using synchronous fallback (no DB in middleware)
  const allowed = canAccessSync(userRole, resource, action);

  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'Forbidden: insufficient permissions',
        required: { resource, action },
      },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
