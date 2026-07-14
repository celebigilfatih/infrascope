import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { canAccessSync, type Resource, type Action } from '@/lib/auth/permission-policy';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { isRateLimited, getClientIp, getRateLimitConfig } from '@/lib/rate-limit';
import { isLicenseServerMode } from '@/lib/license/server-mode';

const PUBLIC_PAGE_ROUTES = ['/login', '/logout', '/verify', '/reset-password', '/setup'];
const LICENSE_SERVER_HOME = '/license-admin';
const LICENSE_SERVER_ALLOWED_PAGE_ROUTES = [
  '/license-admin',
  '/settings/users',
];

// P0-8: Runtime TLS safety check
if (process.env.NODE_ENV === 'production' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  throw new Error('NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden in production. Configure CA certificate paths instead.');
}

// Map API route prefixes to resource names
const ROUTE_RESOURCE_MAP: Record<string, Resource> = {
  '/api/users': 'users',
  '/api/alarms': 'alarms',
  '/api/alarm-incidents': 'alarms',
  '/api/devices': 'devices',
  '/api/organizations': 'organizations',
  '/api/settings': 'settings',
  '/api/audit': 'audit',
  '/api/permissions': 'settings',
  '/api/integrations/fortigate': 'firewall',
  '/api/security/quarantine': 'firewall',
  '/api/firewall-policies': 'firewall',
  '/api/firewalls': 'firewall',
};

// Map HTTP methods to action types
const METHOD_ACTION_MAP: Record<string, Action> = {
  GET: 'read',
  POST: 'write',
  PATCH: 'write',
  PUT: 'write',
  DELETE: 'delete',
};

function isRouteMatch(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isSafeInternalPath(path: string | null): path is string {
  return Boolean(path?.startsWith('/') && !path.startsWith('//'));
}

function isLicenseServerAllowedPage(pathname: string): boolean {
  const normalizedPathname = pathname !== '/' && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return LICENSE_SERVER_ALLOWED_PAGE_ROUTES.includes(normalizedPathname);
}

function normalizeLicenseServerNext(path: string, requestUrl: string): string {
  const parsed = new URL(path, requestUrl);
  return isLicenseServerAllowedPage(parsed.pathname)
    ? `${parsed.pathname}${parsed.search}`
    : LICENSE_SERVER_HOME;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const licenseServerMode = isLicenseServerMode();

  if (!pathname.startsWith('/api/')) {
    const isPublicPage = PUBLIC_PAGE_ROUTES.some((route) => isRouteMatch(pathname, route)) || pathname === '/';
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;

    if (pathname === '/login' && session) {
      const requestedNext = request.nextUrl.searchParams.get('next');
      const nextPath = isSafeInternalPath(requestedNext)
        ? requestedNext
        : (licenseServerMode ? LICENSE_SERVER_HOME : '/dashboard');
      return NextResponse.redirect(new URL(
        licenseServerMode ? normalizeLicenseServerNext(nextPath, request.url) : nextPath,
        request.url
      ));
    }

    if (!session && !isPublicPage) {
      const loginUrl = new URL('/login', request.url);
      if (pathname !== '/') {
        loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      }
      return NextResponse.redirect(loginUrl);
    }

    if (
      session &&
      licenseServerMode &&
      !isPublicPage &&
      !isLicenseServerAllowedPage(pathname)
    ) {
      return NextResponse.redirect(new URL(LICENSE_SERVER_HOME, request.url));
    }

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

  // Skip public API routes (no session required, but rate limiting already applied above)
  const publicApiPrefixes = ['/api/auth/', '/api/health', '/api/setup/', '/api/license-admin/'];
  const publicApiRoutes = ['/api/license/activate', '/api/license/validate', '/api/license/heartbeat'];
  if (
    publicApiPrefixes.some((route) => pathname.startsWith(route)) ||
    publicApiRoutes.includes(pathname)
  ) {
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
  matcher: [
    '/((?!_next|favicon.ico|images|.*\\..*).*)',
  ],
};
