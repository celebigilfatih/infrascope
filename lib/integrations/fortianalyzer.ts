import { createLogger } from '@/lib/logger';
import { secureFetch } from '@/lib/security/tls';
import { createHash } from 'node:crypto';
import { SourceQueryError, throwIfSourceCancelled, withSourceDeadline } from './source-query-error';
import { FA_PROFILE_VERSION, normalizeFortiAnalyzerProfile, type FortiAnalyzerProfileInput } from './fortianalyzer-profile';

const log = createLogger('fortianalyzer');

interface MitreRpcResult {
  status?: { code: number; message?: string };
  [index: number]: { status?: { code: number; message?: string } };
  [field: string]: unknown;
}

function fetchWithAgent(url: string, options: RequestInit) {
  return secureFetch('FORTIANALYZER', url, options);
}

type FortiAnalyzerConfig = FortiAnalyzerProfileInput;

/**
 * Retry configuration for API calls
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  retryableErrors: ['AbortError', 'TypeError', 'fetch failed', 'timeout', 'ECONNRESET', 'ETIMEDOUT'],
};

/**
 * Execute async function with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message || '';

      // Check if error is retryable
      const isRetryable = retryConfig.retryableErrors.some(retryable =>
        errorMessage.includes(retryable) || lastError?.name === retryable
      );

      if (!isRetryable || attempt === retryConfig.maxRetries - 1) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        retryConfig.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        retryConfig.maxDelay
      );

      log.info({ attempt: attempt + 1, maxRetries: retryConfig.maxRetries, delayMs: Math.round(delay) }, 'Retry attempt failed, retrying');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}



// Credential-owned sessions and account-owned throttling survive module reloads.
interface FASessionState {
  session: string | null;
  lastLoginTime: number;
  isConnecting: boolean;
  connectionQueue: Array<(session: string | null) => void>;
}
interface FAAccountState {
  consecutiveFailures: number;
  backoffUntil: number;
  isAccountLocked: boolean;
  lastFailureAt: number;
  isConnecting: boolean;
  connectionQueue: Array<() => void>;
}

function authFingerprint(config: FortiAnalyzerConfig): string {
  return createHash('sha256').update(JSON.stringify({
    host: config.host.trim().toLowerCase(), username: config.username || '',
    password: config.password || '', accessToken: config.accessToken || '',
  })).digest('hex');
}

function authStore() {
  const g = globalThis as typeof globalThis & { _fazAuthStateV2?: {
    sessions: Record<string, FASessionState>; accounts: Record<string, FAAccountState>;
  } };
  // Never adopt legacy host-only sessions whose credential ownership is unknown.
  return g._fazAuthStateV2 ??= { sessions: {}, accounts: {} };
}

function newSessionState(): FASessionState {
  return { session: null, lastLoginTime: 0, isConnecting: false, connectionQueue: [] };
}

function accountState(config: Pick<FortiAnalyzerConfig, 'host' | 'username'>): FAAccountState {
  const key = createHash('sha256').update(JSON.stringify([
    config.host.trim().toLowerCase(), config.username || '',
  ])).digest('hex');
  return authStore().accounts[key] ??= {
    consecutiveFailures: 0, backoffUntil: 0, isAccountLocked: false, lastFailureAt: 0,
    isConnecting: false, connectionQueue: [],
  };
}

async function acquireAccount(state: FAAccountState): Promise<() => void> {
  if (state.isConnecting) {
    await withSourceDeadline(signal => new Promise<void>((resolve, reject) => {
      const grant = () => { signal.removeEventListener('abort', cancel); resolve(); };
      const cancel = () => {
        const index = state.connectionQueue.indexOf(grant);
        if (index !== -1) state.connectionQueue.splice(index, 1);
        reject(new SourceQueryError('SOURCE_CANCELLED', 'Login queue wait was cancelled'));
      };
      state.connectionQueue.push(grant);
      signal.addEventListener('abort', cancel, { once: true });
    }), 60_000);
  } else state.isConnecting = true;
  return () => {
    const next = state.connectionQueue.shift();
    if (next) next();
    else state.isConnecting = false;
  };
}

/** Explicit saved-configuration recovery must not reset other accounts. */
export function resetFortiAnalyzerLoginBackoff(config: FortiAnalyzerConfig): void {
  const profile = normalizeFortiAnalyzerProfile(config);
  const state = profileAccountState(profile);
  state.consecutiveFailures = 0;
  state.backoffUntil = 0;
  state.isAccountLocked = false;
  state.lastFailureAt = 0;
}

function profileAccountState(profile: FortiAnalyzerConfig): FAAccountState {
  return accountState(profile.accessToken
    ? { host: profile.host, username: JSON.stringify([authFingerprint(profile), profile.adom]) }
    : profile);
}

class FortiAnalyzerService {
  private baseUrl: string;
  private config: FortiAnalyzerConfig;
  private session: string | null = null;
  private lastLoginTime: number = 0;
  private readonly loginState: FASessionState;
  private readonly account: FAAccountState;
  private releaseProbeAccount?: () => void;
  private keyVerification?: Promise<boolean>;
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes session TTL

  constructor(config: FortiAnalyzerConfig, private readonly isolatedSession = false) {
    this.config = normalizeFortiAnalyzerProfile(config);
    this.baseUrl = `https://${this.config.host}/jsonrpc`;
    this.loginState = isolatedSession ? newSessionState()
      : (authStore().sessions[authFingerprint(this.config)] ??= newSessionState());
    this.account = profileAccountState(this.config);
    // Keep the legacy authenticated-state marker; fetchRpc sends only a Bearer header.
    if (this.config.accessToken) {
      this.session = this.config.accessToken;
      this.lastLoginTime = Date.now();
    }
  }

  /** Centralized exception to the singleton: authenticate, then close only this probe. */
  static async testConnection(config: FortiAnalyzerConfig): Promise<boolean> {
    const service = new FortiAnalyzerService(config, true);
    try {
      return await service.verifyAccess();
    } catch {
      return false;
    } finally {
      try {
        await service.logout();
      } finally {
        service.releaseProbeAccount?.();
      }
    }
  }

  getLoginHealth() {
    return {
      consecutiveFailures: this.account.consecutiveFailures,
      isAccountLocked: this.account.isAccountLocked,
      backoffRemainingSec: Math.max(0, Math.round((this.account.backoffUntil - Date.now()) / 1000)),
      lastFailureAt: this.account.lastFailureAt > 0 ? new Date(this.account.lastFailureAt) : null,
    };
  }

  getTarget() { return { host: this.config.host, adom: this.config.adom, authMode: this.config.authMode }; }
  async verifyAccess(): Promise<boolean> {
    if (!await this.login()) return false;
    if (!this.config.accessToken) await this.readAdomDevices(true);
    return true;
  }
  private get adomPath() { return encodeURIComponent(this.config.adom!); }

  /** Keep API keys out of URLs and JSON-RPC sessions on every data endpoint. */
  private async fetchRpc(options: RequestInit) {
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    const headers = { ...options.headers as Record<string, string> };
    if (this.config.accessToken) {
      headers.Authorization = `Bearer ${this.config.accessToken}`;
      delete body.session;
    }
    const response = await fetchWithAgent(this.baseUrl, { ...options, headers, body: JSON.stringify(body) });
    if (!response?.ok) throw new SourceQueryError('SOURCE_HTTP_ERROR', 'FortiAnalyzer request failed');
    return response;
  }

  private async readAdomDevices(probe = false): Promise<Array<Record<string, unknown>>> {
    return withSourceDeadline(async signal => {
      const response = await this.fetchRpc({ method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'get', params: [{ url: `/dvmdb/adom/${this.adomPath}/device`,
          fields: ['name', 'devid', 'ip', 'platform'], ...(probe ? { range: [0, 0] } : {}) }], session: this.session, id: 20 }) });
      if (!response.ok) throw new SourceQueryError('SOURCE_HTTP_ERROR', 'FortiAnalyzer ADOM read failed');
      const data = await response.json() as { error?: unknown; result?: Array<{ status?: { code?: number }; data?: unknown }> };
      throwIfSourceCancelled(signal);
      if (data?.error || data?.result?.[0]?.status?.code !== 0) throw new SourceQueryError('SOURCE_REJECTED', 'FortiAnalyzer ADOM read was rejected');
      const devices = data.result[0].data;
      if (!Array.isArray(devices) || devices.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        throw new SourceQueryError('SOURCE_INVALID_RESPONSE', 'FortiAnalyzer ADOM read returned invalid data');
      }
      return devices;
    }, 15_000);
  }

  /**
   * Exponential backoff in ms for consecutive login failures.
   * 1 → 1min, 2 → 2min, 3 → 4min, 4 → 8min, 5 → 16min, 6+ → 60min
   */
  private calcBackoffMs(failures: number): number {
    return Math.min(60_000 * Math.pow(2, failures - 1), 60 * 60 * 1000);
  }

  /**
   * FA session-expired / auth-invalid JSON-RPC codes.
   * -11 = "No permission for the resource" (typically stale session)
   *  -6 = "Invalid URL" when session is completely gone
   *   1 = "Generic error" paired with session/login messages
   * Additional heuristic: any status message containing 'session' / 'login'.
   */
  private isSessionExpiredError(code?: number, message?: string): boolean {
    if (code === -11 || code === -6) return true;
    const msg = (message || '').toLowerCase();
    if (msg.includes('invalid session') || msg.includes('session expired') ||
        msg.includes('login required') || msg.includes('no permission')) {
      return true;
    }
    return false;
  }

  /**
   * Clear session state both locally and globally.
   * Call this whenever FA indicates the session is invalid so the next
   * request triggers a fresh login instead of hammering FA with a dead session
   * (each dead-session call counts as a failed auth and drives the account to
   * permanent lockout on FA).
   */
  private invalidateSession(reason: string): void {
    if (this.config.accessToken) return; // API keys don't expire
    const state = this.loginState;
    if (state.session || this.session) {
      log.warn({ reason }, 'Invalidating session');
    }
    state.session = null;
    state.lastLoginTime = 0;
    this.session = null;
    this.lastLoginTime = 0;
  }

  /**
   * Logout from FortiAnalyzer and invalidate the current session on the server
   * side. Called automatically before re-authentication to prevent session
   * pile-up (FA has a max-concurrent-sessions-per-admin limit; orphan sessions
   * drive the account to permanent lockout that only user recreation fixes).
   */
  private async logout(): Promise<void> {
    const state = this.loginState;
    const sess = state.session || this.session;
    if (!sess || this.config.accessToken) {
      // No session to close, or API-key auth (stateless)
      return;
    }

    try {
      await withSourceDeadline(signal => this.fetchRpc({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'exec',
          params: [{ url: '/sys/logout' }],
          session: sess,
          id: 99,
        }),
      }), 10_000);
      log.info('Logged out — server-side session released');
    } catch {
      // Best-effort: we're about to replace the session anyway
    } finally {
      // Always clear local + global state regardless of logout success
      state.session = null;
      state.lastLoginTime = 0;
      this.session = null;
      this.lastLoginTime = 0;
    }
  }

  /**
   * Check if local session is valid (not expired).
   * Also syncs from global state in case another module instance logged in.
   */
  private isSessionValid(): boolean {
    if (this.config.accessToken) return true; // API keys don't expire

    // Sync from global state (covers multi-instance / hot-reload scenarios)
    const state = this.loginState;
    if (state.session && (Date.now() - state.lastLoginTime) < this.SESSION_TTL_MS) {
      this.session = state.session;
      this.lastLoginTime = state.lastLoginTime;
      return true;
    }

    if (!this.session) return false;
    return (Date.now() - this.lastLoginTime) < this.SESSION_TTL_MS;
  }

  /**
   * Same-credential clients share one login result. Different credentials never
   * receive that result; account-level serialization/backoff still prevents storms.
   */
  async login(): Promise<boolean> {
    if (this.config.accessToken) {
      this.session = this.config.accessToken;
      if (this.keyVerification) return this.keyVerification;
      if (Date.now() < this.account.backoffUntil) return false;
      this.keyVerification = (async () => {
        try {
          await this.readAdomDevices(true);
          this.account.consecutiveFailures = 0; this.account.backoffUntil = 0; this.account.lastFailureAt = 0;
          return true;
        } catch {
          this.account.consecutiveFailures++; this.account.lastFailureAt = Date.now();
          this.account.backoffUntil = Date.now() + this.calcBackoffMs(this.account.consecutiveFailures);
          log.warn('API key or selected ADOM could not be verified'); return false;
        }
        finally { this.keyVerification = undefined; }
      })();
      return this.keyVerification;
    }
    if (this.isSessionValid()) return true;

    const state = this.loginState;
    if (state.isConnecting) {
      const session = await new Promise<string | null>(resolve => state.connectionQueue.push(resolve));
      if (!session) return false;
      this.session = session;
      this.lastLoginTime = state.lastLoginTime;
      return true;
    }
    state.isConnecting = true;
    const account = this.account;
    let releaseAccount: (() => void) | undefined;
    let loginSucceeded = false;
    const fail = (code?: number) => {
      account.consecutiveFailures++;
      account.backoffUntil = Date.now() + this.calcBackoffMs(account.consecutiveFailures);
      account.lastFailureAt = Date.now();
      account.isAccountLocked = code === -22;
      this.invalidateSession('login-failed');
      // Provider messages and transport errors can contain authentication secrets.
      log.warn({ code, consecutiveFailures: account.consecutiveFailures }, 'Login failed');
      return false;
    };
    try {
      releaseAccount = await acquireAccount(account);
      // Recheck after waiting for another credential/probe of this account.
      if (Date.now() < account.backoffUntil) {
        log.warn({ waitSec: Math.ceil((account.backoffUntil - Date.now()) / 1000) }, 'Login suppressed by account backoff');
        return false;
      }
      if (state.session) await this.logout();
      const result = await withSourceDeadline(async signal => {
        const response = await this.fetchRpc({
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({
            jsonrpc: '2.0', method: 'exec',
            params: [{ url: '/sys/login/user', data: { user: this.config.username, passwd: this.config.password } }],
            id: 1,
          }),
        });
        throwIfSourceCancelled(signal);
        if (!response.ok) throw new Error('FA login HTTP failure');
        const data = await response.json() as {
          result?: Array<{ status?: { code?: number } }>; error?: unknown; session?: unknown;
        } | null;
        throwIfSourceCancelled(signal);
        const code = data?.result?.[0]?.status?.code;
        if (!data || data.error || code !== 0 || typeof data.session !== 'string' || !data.session.trim()) {
          return { session: null, code };
        }
        return { session: data.session, code };
      }, 60_000);
      if (!result.session) return fail(result.code);

      state.session = result.session;
      state.lastLoginTime = Date.now();
      account.consecutiveFailures = 0;
      account.backoffUntil = 0;
      account.isAccountLocked = false;
      account.lastFailureAt = 0;
      this.session = state.session;
      this.lastLoginTime = state.lastLoginTime;
      log.info('Login successful');
      loginSucceeded = true;
      return true;
    } catch {
      if (!releaseAccount) {
        log.warn('Login suppressed because the account queue deadline elapsed');
        return false;
      }
      return fail();
    } finally {
      state.isConnecting = false;
      // A suppressed/failed attempt must not deliver an old session to waiters.
      while (state.connectionQueue.length > 0) state.connectionQueue.shift()!(loginSucceeded ? state.session : null);
      if (this.isolatedSession && loginSucceeded) this.releaseProbeAccount = releaseAccount;
      else releaseAccount?.();
    }
  }

  /**
   * Get system status
   */
  async getStatus(): Promise<Record<string, unknown> | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    try {
      const response = await this.fetchRpc({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get',
          params: [{ url: '/sys/status' }],
          session: this.session,
          id: 2,
        }),
      });

      const data = await response.json() as {
        result?: Array<{ data: Record<string, unknown>; status: { code: number; message?: string } }>;
        error?: { code: number; message: string };
      };

      // Session expired on FA side — clear cache so the next call re-logs in
      const outerErr = data.error;
      const innerStatus = data.result?.[0]?.status;
      if (outerErr && this.isSessionExpiredError(outerErr.code, outerErr.message)) {
        this.invalidateSession(`getStatus outer error code=${outerErr.code}`);
        return null;
      }
      if (innerStatus && innerStatus.code !== 0 &&
          this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
        this.invalidateSession(`getStatus status code=${innerStatus.code}`);
        return null;
      }

      if (!data.error && innerStatus?.code === 0) {
        return data.result?.[0]?.data ?? null;
      }
      return null;
    } catch (error) {
      log.error({ err: error }, 'Failed to get status');
      return null;
    }
  }

  /**
   * Get ADOMs
   */
  async getAdoms(): Promise<Array<Record<string, unknown>> | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    try {
      const response = await this.fetchRpc({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get',
          params: [{ url: '/dvmdb/adom' }],
          session: this.session,
          id: 3,
        }),
      });

      const data = await response.json() as {
        result?: Array<{ data: Array<Record<string, unknown>>; status: { code: number; message?: string } }>;
        error?: { code: number; message: string };
      };

      // Session expired on FA side — clear cache so the next call re-logs in
      const outerErr = data.error;
      const innerStatus = data.result?.[0]?.status;
      if (outerErr && this.isSessionExpiredError(outerErr.code, outerErr.message)) {
        this.invalidateSession(`getAdoms outer error code=${outerErr.code}`);
        return null;
      }
      if (innerStatus && innerStatus.code !== 0 &&
          this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
        this.invalidateSession(`getAdoms status code=${innerStatus.code}`);
        return null;
      }

      if (!data.error && innerStatus?.code === 0) {
        return data.result?.[0]?.data ?? null;
      }
      return null;
    } catch (error) {
      log.error({ err: error }, 'Failed to get ADOMs');
      return null;
    }
  }

  /**
   * Get config logs directly (alternative to logsearch)
   */
  async getConfigLogs(limit: number = 50): Promise<Array<Record<string, unknown>>> {
    void limit; // Retain the legacy API contract until config-log collection is implemented.
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return [];
    }

    try {
      // FortiGate cihazlarından config revision geçmişini çek
      const devices = await this.getDevices();
      log.info({ devices }, 'Available devices for config logs');

      // Şimdilik boş döndürüyoruz, daha sonra geliştirilebilir
      return [];
    } catch (error) {
      log.error({ err: error }, 'Failed to get config logs');
      return [];
    }
  }

  /**
   * Get config revisions from FortiGate devices
   */
  async getConfigRevisions(): Promise<Array<Record<string, unknown>>> {
    try {
      // FortiGate cihazlarından config revision geçmişini çek
      const devices = await this.getDevices();
      log.info({ devices }, 'Available devices for config revisions');

      // Şimdilik mock data döndürüyoruz
      // Gerçek entegrasyon için FortiGate servisiyle bağlanabilir
      const mockRevisions: Array<Record<string, unknown>> = [
        {
          id: 1,
          time: Math.floor(Date.now() / 1000) - 3600,
          admin: 'admin',
          comment: 'Firewall policy update',
          version: '1.0.1',
          device: 'FG4H0FT922903115'
        },
        {
          id: 2,
          time: Math.floor(Date.now() / 1000) - 7200,
          admin: 'infrascope',
          comment: 'Interface configuration change',
          version: '1.0.0',
          device: 'FG4H0FT922903137'
        }
      ];

      return mockRevisions;
    } catch (error) {
      log.error({ err: error }, 'Failed to get config revisions');
      return [];
    }
  }

  /**
   * Get devices from ADOM
   */
  async getDevices(): Promise<Array<Record<string, unknown>>> {
    if (!this.session && !await this.login()) throw new SourceQueryError('SOURCE_AUTH_FAILED', 'FortiAnalyzer authentication failed');
    return this.readAdomDevices();
  }

  /**
   * Start log search and get task ID
   */
  async startLogSearch(
    logtype: string = 'event',
    limit: number = 20,
    filter?: string,
    options: { deviceId?: string; signal?: AbortSignal } = {}
  ): Promise<number | null> {
    return withSourceDeadline(async signal => {
      if (!this.session) {
        const loggedIn = await this.login();
        if (!loggedIn) throw new SourceQueryError('SOURCE_AUTH_FAILED', 'FortiAnalyzer authentication failed');
      }

      // Use retry mechanism for transient failures
      return withRetry(async () => {
        throwIfSourceCancelled(signal);
        // Calculate time range: last 30 days, with +24h buffer on end to handle timezone diffs (UTC vs local)
        const now = new Date();
        const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const formatDate = (d: Date) => {
          return d.toISOString().slice(0, 19).replace('T', ' ');
        };

        // Device filter can be configured via environment variable
        // Use 'All_FortiGate' for all devices or specific device serial like 'FG4H0FT922903115'
        const deviceFilter = options.deviceId || process.env.FA_DEVICE_FILTER || 'All_FortiGate';

        const params: Record<string, unknown> = {
          url: `/logview/adom/${this.adomPath}/logsearch`,
          apiver: 3,
          device: [{ devid: deviceFilter }],
          logtype: logtype,
          'time-order': 'desc',
          'time-range': {
            start: formatDate(start),
            end: formatDate(end),
          },
          limit: limit,
        };

        if (filter) {
          params.filter = filter;
        }

        try {
          const response = await this.fetchRpc({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'add',
              params: [params],
              session: this.session,
              id: 10,
            }),
            signal,
          });
          if (!response?.ok) {
            throw new SourceQueryError('SOURCE_HTTP_ERROR', `FortiAnalyzer log search HTTP status ${response?.status ?? 'unavailable'}`);
          }

          const data = await response.json() as {
            result?: { tid: number; status?: { code: number; message?: string } };
            error?: { code: number; message: string };
          };
          if (!data || typeof data !== 'object') {
            throw new SourceQueryError('SOURCE_INVALID_RESPONSE', 'FortiAnalyzer returned an invalid search response');
          }

          // Session expired on FA side — clear cache so the next call re-logs in
          if (data.error && this.isSessionExpiredError(data.error.code, data.error.message)) {
            this.invalidateSession(`startLogSearch outer error code=${data.error.code}`);
            throw new SourceQueryError('SOURCE_SESSION_EXPIRED', 'FortiAnalyzer session expired');
          }
          const innerStatus = data.result?.status;
          if (innerStatus && innerStatus.code !== 0 &&
              this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
            this.invalidateSession(`startLogSearch status code=${innerStatus.code}`);
            throw new SourceQueryError('SOURCE_SESSION_EXPIRED', 'FortiAnalyzer session expired');
          }

          if (data.error || (innerStatus && innerStatus.code !== 0)) {
            throw new SourceQueryError('SOURCE_REJECTED', 'FortiAnalyzer rejected the log search');
          }

          const tid = data.result?.tid;
          if (!Number.isInteger(tid) || !tid || tid < 0) {
            throw new SourceQueryError('SEARCH_NOT_STARTED', 'FortiAnalyzer did not return a valid search task');
          }
          return tid;
        } catch (err) {
          throwIfSourceCancelled(signal);
          throw err; // Re-throw for retry mechanism
        }
      }, { maxRetries: 3, baseDelay: 2000 });
    }, 90_000, options.signal);
  }

  /**
   * Fetch log search results by task ID
   */
  async fetchLogResults(
    tid: number, offset: number = 0, limit: number = 20,
    options: { requireComplete?: boolean; signal?: AbortSignal } = {},
  ): Promise<Array<Record<string, unknown>> | null> {
    return withSourceDeadline(async signal => {
      if (!this.session) {
        const loggedIn = await this.login();
        if (!loggedIn) throw new SourceQueryError('SOURCE_AUTH_FAILED', 'FortiAnalyzer authentication failed');
      }

      // Use retry mechanism for transient failures
      return withRetry(async () => {
        throwIfSourceCancelled(signal);
        try {
          const response = await this.fetchRpc({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'get',
              params: [{
                url: `/logview/adom/${this.adomPath}/logsearch/${tid}`,
                apiver: 3,
                offset: offset,
                limit: limit,
              }],
              session: this.session,
              id: 11,
            }),
          });

          if (!response?.ok) {
            throw new SourceQueryError('SOURCE_HTTP_ERROR', `FortiAnalyzer log results HTTP status ${response?.status ?? 'unavailable'}`);
          }

          const data = await response.json() as {
            result?: {
              data?: Array<Record<string, unknown>>;
              percentage?: number;
              status?: { code: number; message?: string };
            };
            error?: { code: number; message: string };
          };
          if (!data || typeof data !== 'object') {
            throw new SourceQueryError('SOURCE_INVALID_RESPONSE', 'FortiAnalyzer returned an invalid log results response');
          }

          // Session expired on FA side — clear cache so the next call re-logs in
          const outerErr = data.error;
          const innerStatus = data.result?.status;
          if (outerErr && this.isSessionExpiredError(outerErr.code, outerErr.message)) {
            this.invalidateSession(`fetchLogResults outer error code=${outerErr.code}`);
            throw new SourceQueryError('SOURCE_SESSION_EXPIRED', 'FortiAnalyzer session expired');
          }
          if (innerStatus && innerStatus.code !== 0 &&
              this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
            this.invalidateSession(`fetchLogResults status code=${innerStatus.code}`);
            throw new SourceQueryError('SOURCE_SESSION_EXPIRED', 'FortiAnalyzer session expired');
          }

          if (data.error || (innerStatus && innerStatus.code !== 0)) {
            throw new SourceQueryError('SOURCE_REJECTED', 'FortiAnalyzer rejected the log results request');
          }

          const progress = data.result?.percentage;
          if (options.requireComplete) {
            // LogView API v3 documents percentage=100 as the completion marker.
            if (innerStatus?.code !== 0 || typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 100) {
              throw new SourceQueryError('SOURCE_INVALID_RESPONSE', 'FortiAnalyzer search completion metadata is missing or invalid');
            }
            if (progress < 100) return null;
          }
          if (Array.isArray(data.result?.data)) return data.result.data;
          if (typeof progress === 'number' && progress >= 0 && progress < 100) return null;
          throw new SourceQueryError('SOURCE_INVALID_RESPONSE', 'FortiAnalyzer did not return a log result array');
        } catch (err) {
          throwIfSourceCancelled(signal);
          throw err; // Re-throw for retry mechanism
        }
      }, { maxRetries: 3, baseDelay: 2000 });
    }, 120_000, options.signal);
  }

  /**
   * Run a FortiView query (add task, wait, fetch results)
   */
  async getFortiView(
    viewName: string,
    limit: number = 50,
    sortBy?: { field: string; order: 'asc' | 'desc' },
    filter?: string,
    timeRangeMinutes: number = 240
  ): Promise<{ data: Array<Record<string, unknown>>; totalCount?: number } | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    try {
      // Calculate time range with +24h buffer for timezone diffs
      const now = new Date();
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const start = new Date(now.getTime() - timeRangeMinutes * 60 * 1000);
      const formatDate = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

      const params: Record<string, unknown> = {
        url: `/fortiview/adom/${this.adomPath}/${viewName}/run`,
        apiver: 3,
        device: [{ devid: 'All_FortiGate' }],
        limit: limit,
        offset: 0,
        'count-total': true,
        'time-range': { start: formatDate(start), end: formatDate(end) },
      };

      if (sortBy) {
        params['sort-by'] = [{ field: sortBy.field, order: sortBy.order }];
      }
      if (filter) {
        params.filter = filter;
      }

      // Step 1: Start FortiView task
      const addResponse = await this.fetchRpc({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'add',
          params: [params],
          session: this.session,
          id: 30,
        }),
      });

      const addData = await addResponse.json() as {
        result?: { tid: number } | Array<{ tid?: number; status?: { code: number; message: string } }>;
        error?: { code: number; message: string };
      };

      // Handle both response formats: {result: {tid}} and {result: [{tid, status}]}
      let tid: number | null = null;
      if (addData.error) {
        // Session expired on FA side — clear cache so the next call re-logs in
        if (this.isSessionExpiredError(addData.error.code, addData.error.message)) {
          this.invalidateSession(`getFortiView add outer error code=${addData.error.code}`);
          return null;
        }
        log.error({ viewName, code: addData.error?.code }, 'FortiView add error');
        return null;
      }
      if (Array.isArray(addData.result)) {
        const first = addData.result[0];
        if (first?.status && first.status.code !== 0) {
          // Session expired on FA side — check inner status
          if (this.isSessionExpiredError(first.status.code, first.status.message)) {
            this.invalidateSession(`getFortiView add status code=${first.status.code}`);
            return null;
          }
          log.error({ viewName, code: first.status?.code }, 'FortiView add status error');
          return null;
        }
        tid = first?.tid ?? null;
      } else if (addData.result && 'tid' in addData.result) {
        const status = (addData.result as { status?: { code?: number } }).status;
        if (status && status.code !== 0) return null;
        tid = addData.result.tid;
      }

      if (!tid) {
        log.error({ viewName }, 'FortiView add: no tid in response');
        return null;
      }

      log.info({ viewName, tid }, 'FortiView task started');

      // Step 2: Poll for results (max 60 seconds)
      for (let i = 0; i < 12; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const getResponse = await this.fetchRpc({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'get',
            params: [{
              url: `/fortiview/adom/${this.adomPath}/${viewName}/run/${tid}`,
              apiver: 3,
            }],
            session: this.session,
            id: 31,
          }),
        });

        const getData = await getResponse.json() as {
          result?: {
            percentage: number;
            data?: Array<Record<string, unknown>>;
            'total-count-all'?: number;
            'return-lines'?: number;
            status?: { code: number; message: string };
          };
          error?: { code: number; message: string };
        };

        if (getData.error) {
          // Session expired on FA side — clear cache so the next call re-logs in
          if (this.isSessionExpiredError(getData.error.code, getData.error.message)) {
            this.invalidateSession(`getFortiView poll outer error code=${getData.error.code}`);
            return null;
          }
          log.error({ code: getData.error?.code }, 'FortiView get error');
          return null;
        }

        const result = getData.result;
        // Session expired on FA side — check inner status
        if (result?.status && result.status.code !== 0 &&
            this.isSessionExpiredError(result.status.code, result.status.message)) {
          this.invalidateSession(`getFortiView poll status code=${result.status.code}`);
          return null;
        }
        if (result?.status && result.status.code !== 0) return null;
        if (result && result.percentage === 100 && Array.isArray(result.data)) {
          log.info({ viewName, percentage: result.percentage, rowCount: result.data.length }, 'FortiView completed');
          return {
            data: result.data,
            totalCount: result['total-count-all'],
          };
        }

        // Still processing, continue polling
        log.info({ viewName, percentage: result?.percentage || 0 }, 'FortiView progress');
      }

      log.warn({ viewName }, 'FortiView timed out');
      return null;
    } catch (error) {
      log.error({ err: error, viewName }, 'Failed to get FortiView');
      return null;
    }
  }

  /**
   * Get MITRE ATT&CK Matrix data
   */
  async getMitreAttackMatrix(options: { domain?: string; timeRange?: { start: string; end: string }; adom?: string } = {}): Promise<unknown> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    const { domain = 'enterprise', timeRange, adom = this.config.adom } = options;
    if (adom !== this.config.adom) throw new SourceQueryError('SOURCE_TARGET_MISMATCH', 'Requested ADOM differs from the configured target');

    try {
      const params: Record<string, unknown> = {
        url: `/eventmgmt/adom/${this.adomPath}/mitre-attack-matrix`,
        apiver: 3,
        'mitre-domain': domain,
        option: ['metadata', 'event-count', 'incident-count', 'handler-count'],
      };

      if (timeRange) {
        params['time-range'] = {
          start: timeRange.start,
          end: timeRange.end
        };
      }

      const requestBody = {
        jsonrpc: '2.0',
        method: 'get',
        params: [params],
        session: this.session,
        id: 40,
      };

      const response = await this.fetchRpc({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json() as {
        result?: MitreRpcResult;
        error?: { code: number; message: string };
      };

      // Session expired on FA side — clear cache so the next call re-logs in
      if (data.error && this.isSessionExpiredError(data.error.code, data.error.message)) {
        this.invalidateSession(`getMitreAttackMatrix outer error code=${data.error.code}`);
        return null;
      }
      // Check inner status (FA may return status inside result)
      const innerStatus = data.result?.status || data.result?.[0]?.status;
      if (innerStatus && innerStatus.code !== 0 &&
          this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
        this.invalidateSession(`getMitreAttackMatrix status code=${innerStatus.code}`);
        return null;
      }

      if (data.error || !innerStatus || innerStatus.code !== 0) {
        log.error({ code: data.error?.code }, 'MITRE error in response');
        return null;
      }

      return data;
    } catch (error) {
      log.error({ err: error }, 'MITRE exception');
      return null;
    }
  }

  /**
   * Get details for a specific MITRE technique
   */
  async getMitreTechniqueDetails(techId: string, options: { domain?: string; timeRange?: { start: string; end: string }; adom?: string } = {}): Promise<unknown> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    const { domain = 'enterprise', timeRange, adom = this.config.adom } = options;
    if (adom !== this.config.adom) throw new SourceQueryError('SOURCE_TARGET_MISMATCH', 'Requested ADOM differs from the configured target');

    try {
      const params: Record<string, unknown> = {
        url: `/eventmgmt/adom/${this.adomPath}/mitre-attack-matrix/technique/${techId}`,
        apiver: 3,
        'mitre-domain': domain,
        option: ['metadata', 'handler-summary'],
      };

      if (timeRange) {
        params['time-range'] = {
          start: timeRange.start,
          end: timeRange.end
        };
      }

      const response = await this.fetchRpc({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get',
          params: [params],
          session: this.session,
          id: 41,
        }),
      });

      const data = await response.json() as {
        result?: MitreRpcResult;
        error?: { code: number; message: string };
      };

      // Session expired on FA side — clear cache so the next call re-logs in
      if (data.error && this.isSessionExpiredError(data.error.code, data.error.message)) {
        this.invalidateSession(`getMitreTechniqueDetails outer error code=${data.error.code}`);
        return null;
      }
      // Check inner status (FA may return status inside result)
      const innerStatus = data.result?.status || data.result?.[0]?.status;
      if (innerStatus && innerStatus.code !== 0 &&
          this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
        this.invalidateSession(`getMitreTechniqueDetails status code=${innerStatus.code}`);
        return null;
      }

      if (data.error || !innerStatus || innerStatus.code !== 0) {
        log.error({ techId, code: data.error?.code }, 'MITRE technique get error');
        return null;
      }

      return data.result;
    } catch (error) {
      log.error({ err: error, techId }, 'Failed to get MITRE technique');
      return null;
    }
  }

  /**
   * Get event logs (convenience method)
   */
  async getEventLogs(limit: number = 20): Promise<Array<Record<string, unknown>>> {
    const tid = await this.startLogSearch('event', limit);
    if (!tid) return [];

    // Wait a bit for search to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    const logs = await this.fetchLogResults(tid, 0, limit);
    return logs || [];
  }
}

export default FortiAnalyzerService;

/**
 * Singleton FortiAnalyzerService instance factory.
 * Returns a shared instance to prevent concurrent login limit issues.
 * All services sharing this instance benefit from session pooling.
 */
let _sharedInstance: FortiAnalyzerService | null = null;
const _sharedInstances = new Map<string, { host: string; fingerprint: string; service: FortiAnalyzerService }>();

export function getSharedFortiAnalyzerService(): FortiAnalyzerService | null {
  // If already initialized, return the cached instance
  if (_sharedInstance) return _sharedInstance;

  // Construct from env/DB config is done lazily at call sites via initSharedFortiAnalyzerService
  return null;
}

export function initSharedFortiAnalyzerService(config: FortiAnalyzerConfig): FortiAnalyzerService {
  const profile = normalizeFortiAnalyzerProfile(config);
  const host = profile.host;
  const key = JSON.stringify([host, profile.adom, profile.authMode, FA_PROFILE_VERSION]);
  const fingerprint = authFingerprint(profile);
  const existing = _sharedInstances.get(key);
  if (existing?.fingerprint === fingerprint) {
    _sharedInstance = existing.service;
    return existing.service;
  }
  _sharedInstance = new FortiAnalyzerService(profile);
  _sharedInstances.set(key, { host, fingerprint, service: _sharedInstance });
  log.info({ host }, existing ? 'Shared instance rotated' : 'Shared instance created');
  return _sharedInstance;
}

/**
 * Returns the live login health state for the configured FA host.
 * Used by the health endpoint and alarm runner to surface failures.
 */
export function getFortiAnalyzerLoginHealth(host?: string): {
  consecutiveFailures: number;
  isAccountLocked: boolean;
  backoffRemainingSec: number;
  lastFailureAt: Date | null;
} {
  const service = host ? [..._sharedInstances.values()].reverse().find(entry => entry.host === host.trim().toLowerCase())?.service : _sharedInstance;
  if (!service) {
    return { consecutiveFailures: 0, isAccountLocked: false, backoffRemainingSec: 0, lastFailureAt: null };
  }
  return service.getLoginHealth();
}
