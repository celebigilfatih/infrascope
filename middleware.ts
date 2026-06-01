import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessSync, type Resource, type Action } from '@/lib/auth/permissions';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/ routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Skip public API routes (no auth required)
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
    // No permission mapping for this route - allow through
    return NextResponse.next();
  }

  // Get user role from header (set by client or auth layer)
  const userRole = request.headers.get('x-user-role')?.toUpperCase() || 'VIEWER';
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
