import { createLogger } from '@/lib/logger';
import { secureFetch } from '@/lib/security/tls';
import { createHash } from 'node:crypto';

const log = createLogger('fortianalyzer');

function fetchWithAgent(url: string, options: RequestInit) {
  return secureFetch('FORTIANALYZER', url, options);
}

interface FortiAnalyzerConfig {
  host: string;
  accessToken?: string;
  username?: string;
  password?: string;
  pollingInterval?: number;
}

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

interface EventLog {
  id: string;
  eventtime: number;
  logid: string;
  type: string;
  subtype: string;
  action: string;
  level: string;
  vdom: string;
  eventtype: string;
  user: string;
  srcip: string;
  dstip: string;
  srcport: number;
  dstport: number;
  proto: number;
  devtype: string;
  devname: string;
  policyid: number;
  policytype: string;
  service: string;
  direction: string;
  srccountry: string;
  dstcountry: string;
  app: string;
  appcat: string;
  apprisk: string;
  appact: string;
  bytes: number;
  packetcount: number;
  duration: number;
  msg: string;
}

// ── Global FA login state ────────────────────────────────────────────────────
// Shared across ALL module instances (hot reloads, code splitting).
// Keyed by host so multiple FA instances are supported.
interface FAGlobalLoginState {
  session: string | null;
  lastLoginTime: number;
  isConnecting: boolean;
  connectionQueue: Array<(session: string | null) => void>;
  consecutiveFailures: number;
  backoffUntil: number; // epoch ms — login suppressed until this time
  isAccountLocked: boolean; // true when FA returned code=-22 (too many failed logins)
  lastFailureAt: number;  // epoch ms of last login failure
}

function getGlobalLoginState(host: string): FAGlobalLoginState {
  const g = globalThis as any;
  if (!g._fazGlobalState) g._fazGlobalState = {};
  if (!g._fazGlobalState[host]) {
    g._fazGlobalState[host] = {
      session: null,
      lastLoginTime: 0,
      isConnecting: false,
      connectionQueue: [],
      consecutiveFailures: 0,
      backoffUntil: 0,
      isAccountLocked: false,
      lastFailureAt: 0,
    };
  }
  return g._fazGlobalState[host];
}

class FortiAnalyzerService {
  private baseUrl: string;
  private config: FortiAnalyzerConfig;
  private session: string | null = null;
  private lastLoginTime: number = 0;
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes session TTL

  constructor(config: FortiAnalyzerConfig) {
    this.config = config;
    this.baseUrl = `https://${config.host}/jsonrpc`;
    // If accessToken provided, use directly as session (API key auth - no login needed)
    if (config.accessToken) {
      this.session = config.accessToken;
      this.lastLoginTime = Date.now();
    }
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
    const state = getGlobalLoginState(this.config.host);
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
    const state = getGlobalLoginState(this.config.host);
    const sess = state.session || this.session;
    if (!sess || this.config.accessToken) {
      // No session to close, or API-key auth (stateless)
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      await fetchWithAgent(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'exec',
          params: [{ url: '/sys/logout' }],
          session: sess,
          id: 99,
        }),
      } as any).catch(() => null); // best-effort, ignore network errors

      clearTimeout(timeoutId);
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
    const state = getGlobalLoginState(this.config.host);
    if (state.session && (Date.now() - state.lastLoginTime) < this.SESSION_TTL_MS) {
      this.session = state.session;
      this.lastLoginTime = state.lastLoginTime;
      return true;
    }

    if (!this.session) return false;
    return (Date.now() - this.lastLoginTime) < this.SESSION_TTL_MS;
  }

  /**
   * Login with username/password.
   *
   * Uses a globalThis-level mutex so concurrent logins from ANY module instance
   * (hot reloads, code splitting, EventCache + AlarmEngine startup race) are
   * serialised into a single network request.
   *
   * Exponential backoff is applied after each failure to prevent FA account
   * lock-out storms (code=-22 from too many consecutive bad logins).
   */
  async login(): Promise<boolean> {
    // API key auth — no login needed
    if (this.config.accessToken) {
      this.session = this.config.accessToken;
      return true;
    }

    // Return existing valid session (also syncs from global)
    if (this.isSessionValid()) return true;

    const state = getGlobalLoginState(this.config.host);

    // Best-effort logout if we have a stale/cached session on file.
    // This releases the server-side session so it does not pile up in FA's
    // admin session table (the primary driver of permanent account lockout).
    if (state.session) {
      await this.logout();
    }

    // ── Backoff guard ────────────────────────────────────────────────────────
    // Suppress login entirely while backoff window is active.
    // This prevents the lockout storm where hundreds of failed attempts in quick
    // succession cause FA to permanently lock the account.
    if (Date.now() < state.backoffUntil) {
      const waitSec = Math.round((state.backoffUntil - Date.now()) / 1000);
      log.warn(
        { waitSec, consecutiveFailures: state.consecutiveFailures },
        'Login suppressed — backoff active. Account may be locked on FA; unlock via System → Administrators → infrascope → Unlock'
      );
      return false;
    }

    // ── Global login mutex ───────────────────────────────────────────────────
    // If another instance is already logging in, wait for its result instead
    // of firing a second simultaneous login request.
    if (state.isConnecting) {
      log.info('Waiting for in-progress login from another instance');
      const sess = await new Promise<string | null>((resolve) =>
        state.connectionQueue.push(resolve)
      );
      if (sess) {
        this.session = sess;
        this.lastLoginTime = state.lastLoginTime;
        return true;
      }
      return false;
    }

    // ── Acquire global lock ──────────────────────────────────────────────────
    state.isConnecting = true;

    const releaseWithSession = (sess: string | null) => {
      state.isConnecting = false;
      while (state.connectionQueue.length > 0) {
        state.connectionQueue.shift()!(sess);
      }
    };

    try {
      log.info({ username: this.config.username }, 'Logging in');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetchWithAgent(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'exec',
          params: [{
            url: '/sys/login/user',
            data: { user: this.config.username, passwd: this.config.password },
          }],
          id: 1,
        }),
      } as any).catch((err) => {
        clearTimeout(timeoutId);
        log.error({ err }, 'Login request failed');
        return null;
      });

      clearTimeout(timeoutId);

      if (!response) {
        state.consecutiveFailures++;
        const bMs = this.calcBackoffMs(state.consecutiveFailures);
        state.backoffUntil = Date.now() + bMs;
        state.session = null;
        log.error({ consecutiveFailures: state.consecutiveFailures, backoffMin: Math.round(bMs / 60000) }, 'Login request failed');
        releaseWithSession(null);
        return false;
      }

      const data = await response.json() as {
        result?: Array<{ status: { code: number; message: string } }>;
        session?: string;
      };

      const status = data.result?.[0]?.status;

      if (status?.code === 0 && data.session) {
        // ── Success ─────────────────────────────────────────────────────────
        state.session = data.session;
        state.lastLoginTime = Date.now();
        state.consecutiveFailures = 0;
        state.backoffUntil = 0;
        state.isAccountLocked = false;
        state.lastFailureAt = 0;
        this.session = state.session;
        this.lastLoginTime = state.lastLoginTime;
        log.info('Login successful — failure counter reset');
        releaseWithSession(state.session);
        return true;
      }

      // ── Failure ──────────────────────────────────────────────────────────
      state.consecutiveFailures++;
      const bMs = this.calcBackoffMs(state.consecutiveFailures);
      state.backoffUntil = Date.now() + bMs;
      state.session = null;
      state.lastFailureAt = Date.now();
      this.session = null;
      // code=-22 = FA account locked (too many failed logins)
      if (status?.code === -22) {
        state.isAccountLocked = true;
        log.error(
          { code: -22, backoffMin: Math.round(bMs / 60000) },
          'Account LOCKED — unlock via FA GUI: System → Administrators → infrascope → Unlock'
        );
      } else {
        state.isAccountLocked = false;
        log.error(
          { code: status?.code, message: status?.message, consecutiveFailures: state.consecutiveFailures, backoffMin: Math.round(bMs / 60000) },
          'Login failed'
        );
      }
      releaseWithSession(null);
      return false;
    } catch (error) {
      state.consecutiveFailures++;
      const bMs = this.calcBackoffMs(state.consecutiveFailures);
      state.backoffUntil = Date.now() + bMs;
      state.session = null;
      state.lastFailureAt = Date.now();
      this.session = null;
      log.error({ err: error, consecutiveFailures: state.consecutiveFailures }, 'Login threw exception');
      releaseWithSession(null);
      return false;
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
      const response = await fetchWithAgent(this.baseUrl, {
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

      if (data.result && data.result[0].status.code === 0) {
        return data.result[0].data;
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
      const response = await fetchWithAgent(this.baseUrl, {
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

      if (data.result && data.result[0].status.code === 0) {
        return data.result[0].data;
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
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return [];
    }

    try {
      const response = await fetchWithAgent(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'get',
          params: [{
            url: '/dvmdb/adom/root/device',
            fields: ['name', 'devid', 'ip', 'platform'],
          }],
          session: this.session,
          id: 20,
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
        this.invalidateSession(`getDevices outer error code=${outerErr.code}`);
        return [];
      }
      if (innerStatus && innerStatus.code !== 0 &&
          this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
        this.invalidateSession(`getDevices status code=${innerStatus.code}`);
        return [];
      }

      if (data.result && Array.isArray(data.result)) {
        return data.result[0]?.data || [];
      }
      return [];
    } catch (error) {
      log.error({ err: error }, 'Failed to get devices');
      return [];
    }
  }

  /**
   * Start log search and get task ID
   */
  async startLogSearch(
    logtype: string = 'event',
    limit: number = 20,
    filter?: string,
    options: { deviceId?: string } = {}
  ): Promise<number | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    // Use retry mechanism for transient failures
    return withRetry(async () => {
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
        url: '/logview/adom/root/logsearch',
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

      // Add timeout for fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout (increased for large datasets)

      try {
        const response = await fetchWithAgent(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'add',
            params: [params],
            session: this.session,
            id: 10,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response) {
          throw new Error('No response from FortiAnalyzer');
        }

        const data = await response.json() as {
          result?: { tid: number; status?: { code: number; message?: string } };
          error?: { code: number; message: string };
        };

        // Session expired on FA side — clear cache so the next call re-logs in
        if (data.error && this.isSessionExpiredError(data.error.code, data.error.message)) {
          this.invalidateSession(`startLogSearch outer error code=${data.error.code}`);
          return null;
        }
        const innerStatus = data.result?.status;
        if (innerStatus && innerStatus.code !== 0 &&
            this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
          this.invalidateSession(`startLogSearch status code=${innerStatus.code}`);
          return null;
        }

        if (data.error) {
          throw new Error(`Log search error: ${data.error.message}`);
        }

        return data.result?.tid || null;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err; // Re-throw for retry mechanism
      }
    }, { maxRetries: 3, baseDelay: 2000 });
  }

  /**
   * Fetch log search results by task ID
   */
  async fetchLogResults(tid: number, offset: number = 0, limit: number = 20): Promise<Array<Record<string, unknown>> | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    // Use retry mechanism for transient failures
    return withRetry(async () => {
      // Add AbortController timeout to prevent hanging fetch (was causing isCheckRunning to stay stuck)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s timeout (increased for complex queries)

      try {
        const response = await fetchWithAgent(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'get',
            params: [{
              url: `/logview/adom/root/logsearch/${tid}`,
              apiver: 3,
              offset: offset,
              limit: limit,
            }],
            session: this.session,
            id: 11,
          }),
        });

        clearTimeout(timeoutId);

        if (!response) {
          throw new Error('No response from FortiAnalyzer');
        }

        // Also timeout the JSON parsing in case response body is truncated/slow
        const data = await Promise.race([
          response.json() as Promise<{
            result?: {
              data: Array<Record<string, unknown>>;
              status: { code: number; message: string };
            };
            error?: { code: number; message: string };
          }>,
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('JSON parse timeout')), 30000)), // 30s for large result sets
        ]);

        if (!data) {
          throw new Error(`fetchLogResults JSON parse timed out (tid=${tid})`);
        }

        // Session expired on FA side — clear cache so the next call re-logs in
        const outerErr = data.error;
        const innerStatus = data.result?.status;
        if (outerErr && this.isSessionExpiredError(outerErr.code, outerErr.message)) {
          this.invalidateSession(`fetchLogResults outer error code=${outerErr.code}`);
          return null;
        }
        if (innerStatus && innerStatus.code !== 0 &&
            this.isSessionExpiredError(innerStatus.code, innerStatus.message)) {
          this.invalidateSession(`fetchLogResults status code=${innerStatus.code}`);
          return null;
        }

        if (data.error) {
          throw new Error(`Fetch logs error: ${data.error.message}`);
        }

        return data.result?.data || null;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err; // Re-throw for retry mechanism
      }
    }, { maxRetries: 3, baseDelay: 2000 });
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
        url: `/fortiview/adom/root/${viewName}/run`,
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
      const addResponse = await fetchWithAgent(this.baseUrl, {
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
        log.error({ viewName, error: addData.error }, 'FortiView add error');
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
          log.error({ viewName, status: first.status }, 'FortiView add status error');
          return null;
        }
        tid = first?.tid ?? null;
      } else if (addData.result && 'tid' in addData.result) {
        tid = addData.result.tid;
      }

      if (!tid) {
        log.error({ viewName, response: addData }, 'FortiView add: no tid in response');
        return null;
      }

      log.info({ viewName, tid }, 'FortiView task started');

      // Step 2: Poll for results (max 60 seconds)
      for (let i = 0; i < 12; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const getResponse = await fetchWithAgent(this.baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'get',
            params: [{
              url: `/fortiview/adom/root/${viewName}/run/${tid}`,
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
          log.error({ error: getData.error }, 'FortiView get error');
          return null;
        }

        const result = getData.result;
        // Session expired on FA side — check inner status
        if (result?.status && result.status.code !== 0 &&
            this.isSessionExpiredError(result.status.code, result.status.message)) {
          this.invalidateSession(`getFortiView poll status code=${result.status.code}`);
          return null;
        }
        if (result && result.percentage >= 90 && result.data && result.data.length > 0) {
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
  async getMitreAttackMatrix(options: { domain?: string; timeRange?: { start: string; end: string }; adom?: string } = {}): Promise<any> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    const { domain = 'enterprise', timeRange, adom = 'root' } = options;

    try {
      const params: Record<string, unknown> = {
        url: `/eventmgmt/adom/${adom}/mitre-attack-matrix`,
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

      const response = await fetchWithAgent(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json() as {
        result?: any;
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

      if (data.error) {
        log.error({ error: data.error }, 'MITRE error in response');
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
  async getMitreTechniqueDetails(techId: string, options: { domain?: string; timeRange?: { start: string; end: string }; adom?: string } = {}): Promise<any> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    const { domain = 'enterprise', timeRange, adom = 'root' } = options;

    try {
      const params: Record<string, unknown> = {
        url: `/eventmgmt/adom/${adom}/mitre-attack-matrix/technique/${techId}`,
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

      const response = await fetchWithAgent(this.baseUrl, {
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
        result?: any;
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

      if (data.error) {
        log.error({ techId, error: data.error }, 'MITRE technique get error');
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
let _sharedInstanceHost: string | null = null;
const _sharedInstances = new Map<string, { fingerprint: string; service: FortiAnalyzerService }>();

export function getSharedFortiAnalyzerService(): FortiAnalyzerService | null {
  // If already initialized, return the cached instance
  if (_sharedInstance) return _sharedInstance;

  // Construct from env/DB config is done lazily at call sites via initSharedFortiAnalyzerService
  return null;
}

export function initSharedFortiAnalyzerService(config: FortiAnalyzerConfig): FortiAnalyzerService {
  const host = config.host.trim().toLowerCase();
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({
      host,
      username: config.username || '',
      password: config.password || '',
      accessToken: config.accessToken || '',
    }))
    .digest('hex');
  const existing = _sharedInstances.get(host);
  if (existing?.fingerprint === fingerprint) {
    _sharedInstance = existing.service;
    _sharedInstanceHost = host;
    return existing.service;
  }
  _sharedInstance = new FortiAnalyzerService({ ...config, host });
  _sharedInstanceHost = host;
  _sharedInstances.set(host, { fingerprint, service: _sharedInstance });
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
  const resolvedHost = host || _sharedInstanceHost;
  if (!resolvedHost) {
    return { consecutiveFailures: 0, isAccountLocked: false, backoffRemainingSec: 0, lastFailureAt: null };
  }
  const state = getGlobalLoginState(resolvedHost);
  return {
    consecutiveFailures: state.consecutiveFailures,
    isAccountLocked: state.isAccountLocked,
    backoffRemainingSec: Math.max(0, Math.round((state.backoffUntil - Date.now()) / 1000)),
    lastFailureAt: state.lastFailureAt > 0 ? new Date(state.lastFailureAt) : null,
  };
}
