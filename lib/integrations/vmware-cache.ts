import { createHash } from 'crypto';
import type { VMwareConfig } from './vmware';

type Entry = { data: unknown; timestamp: number; expiresAt: number };
type Pending = Promise<unknown>;
type CacheState = { entries: Map<string, Entry>; pending: Map<string, Pending> };
const runtime = globalThis as typeof globalThis & { __vmwareTargetCacheV1?: CacheState };
const state = runtime.__vmwareTargetCacheV1 ??= { entries: new Map(), pending: new Map() };
const STALE_WINDOW = 30 * 60_000;

export function normalizeVMwareHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

// Private process-local identity; never include it or its inputs in API responses/logs.
export function getVMwareCacheScope(config: Omit<VMwareConfig, 'password'> & { password?: string }): string {
  const modules = config.enabledModules;
  return createHash('sha256').update(JSON.stringify([
    normalizeVMwareHost(config.host), config.username, config.password ?? '', config.thumbprint ?? '',
    config.pollingInterval, ...['datacenters', 'clusters', 'hosts', 'vms', 'datastores']
      .map(name => modules?.[name as keyof typeof modules] ?? null),
  ])).digest('hex');
}

export function vmwareResourceKey(type: string | null, vmId?: string | null): string {
  return JSON.stringify([type, vmId ?? null]);
}

function keyFor(scope: string, key: string): string { return `${scope}:${key}`; }

function prune(): void {
  const now = Date.now();
  for (const [key, value] of state.entries) if (now >= value.expiresAt) state.entries.delete(key);
}

export function getVMwareCachedValue<T>(scope: string, key: string): { data: T; timestamp: number } | undefined {
  prune();
  const value = state.entries.get(keyFor(scope, key));
  return value ? { data: value.data as T, timestamp: value.timestamp } : undefined;
}

export function cacheVMwareValue<T>(scope: string, key: string, data: T, lifetime: number): void {
  prune();
  const timestamp = Date.now();
  state.entries.set(keyFor(scope, key), { data, timestamp, expiresAt: timestamp + lifetime });
}

export function invalidateVMwareCache(scope: string): void {
  const prefix = `${scope}:`;
  for (const key of state.entries.keys()) if (key.startsWith(prefix)) state.entries.delete(key);
  // Removing the pending token prevents already-started loads from republishing retired data.
  for (const key of state.pending.keys()) if (key.startsWith(prefix)) state.pending.delete(key);
}

export async function loadVMwareCachedValue<T>(
  scope: string, resource: string, ttl: number, loader: (isCurrent: () => boolean) => Promise<T>, bypass = false,
): Promise<{ data: T; cache: 'HIT' | 'STALE' | 'MISS'; age: number }> {
  const key = keyFor(scope, resource);
  const entry = bypass ? undefined : getVMwareCachedValue<T>(scope, resource);
  const load = (): Promise<T> => {
    const existing = state.pending.get(key);
    if (existing) return existing as Promise<T>;
    const pending: Promise<T> = Promise.resolve().then(() => loader(() => state.pending.get(key) === pending)).then(data => {
      if (state.pending.get(key) === pending) cacheVMwareValue(scope, resource, data, ttl + STALE_WINDOW);
      return data;
    }).finally(() => {
      if (state.pending.get(key) === pending) state.pending.delete(key);
    });
    state.pending.set(key, pending);
    return pending;
  };
  if (entry) {
    const age = Date.now() - entry.timestamp;
    if (age < ttl) return { data: entry.data, cache: 'HIT', age };
    if (age < ttl + STALE_WINDOW) {
      void load().catch(() => console.warn('[VMware Cache] Background refresh failed; cached age is unchanged'));
      return { data: entry.data, cache: 'STALE', age };
    }
  }
  return { data: await load(), cache: 'MISS', age: 0 };
}
