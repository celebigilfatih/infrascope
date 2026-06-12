/**
 * In-memory sliding window rate limiter.
 * No external dependencies (Redis, etc.) — suitable for single-instance deployment.
 * Resets on server restart (acceptable for basic protection).
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/** Auth endpoints: strict limit to prevent brute-force */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
};

/** General API: generous but prevents abuse */
export const GENERAL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

const store = new Map<string, number[]>();
const MAX_STORE_SIZE = 10_000;
let callCount = 0;

/**
 * IPs that indicate local development environment (Docker Desktop, localhost).
 * These should bypass rate limiting because all browser traffic appears to come
 * from the same gateway IP in Docker Desktop environments.
 */
const DEV_BYPASS_IPS = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  '::ffff:192.168.65.1',  // Docker Desktop macOS/Windows host gateway
  '192.168.65.1',
  '172.17.0.1',            // Docker bridge gateway (Linux)
  '::ffff:172.17.0.1',
]);

/**
 * Check if a request from the given IP is rate-limited.
 * Uses a sliding window: only timestamps within `windowMs` of now count.
 * Bypasses rate limiting for local development IPs.
 */
export function isRateLimited(
  ip: string,
  config: RateLimitConfig
): { limited: boolean; retryAfterMs: number } {
  // Bypass rate limiting for local development IPs
  if (DEV_BYPASS_IPS.has(ip)) {
    return { limited: false, retryAfterMs: 0 };
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = store.get(ip);

  if (timestamps) {
    // Filter out timestamps outside the window
    timestamps = timestamps.filter((ts) => ts > windowStart);
  } else {
    timestamps = [];
  }

  // Check if limit exceeded
  if (timestamps.length >= config.maxRequests) {
    // Retry-After: time until the oldest request in the window expires
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    store.set(ip, timestamps);
    return { limited: true, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  // Record this request
  timestamps.push(now);
  store.set(ip, timestamps);

  // Periodic cleanup to prevent memory leaks
  callCount++;
  if (callCount % 1000 === 0) {
    pruneStore(now);
  }

  return { limited: false, retryAfterMs: 0 };
}

/**
 * Remove old entries and enforce max store size.
 */
function pruneStore(now: number): void {
  // Remove entries where all timestamps are older than any possible window (5 min)
  const cutoff = now - 5 * 60 * 1000;
  for (const [ip, timestamps] of store) {
    const filtered = timestamps.filter((ts) => ts > cutoff);
    if (filtered.length === 0) {
      store.delete(ip);
    } else {
      store.set(ip, filtered);
    }
  }

  // LRU eviction: if store is still too large, delete oldest 20%
  if (store.size > MAX_STORE_SIZE) {
    const toDelete = Math.floor(store.size * 0.2);
    let deleted = 0;
    for (const key of store.keys()) {
      if (deleted >= toDelete) break;
      store.delete(key);
      deleted++;
    }
  }
}

/**
 * Extract client IP from request headers.
 * In production behind a reverse proxy, x-forwarded-for is set by the proxy.
 */
export function getClientIp(request: { headers: { get: (name: string) => string | null } }): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for may contain multiple IPs; the first is the original client
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  // Local dev fallback — use real-ip header or a random per-connection key
  // so multiple browser tabs don't share one bucket
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  // In local development (no proxy), each request gets a unique key
  // to prevent all localhost traffic from sharing one rate-limit bucket.
  // This also covers Edge Runtime where NODE_ENV may still say 'production'.
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Determine which rate limit config applies based on the request path.
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig {
  if (pathname.startsWith('/api/auth/')) {
    return AUTH_RATE_LIMIT;
  }
  return GENERAL_RATE_LIMIT;
}
