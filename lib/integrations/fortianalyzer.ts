interface FortiAnalyzerConfig {
  host: string;
  accessToken?: string;
  username?: string;
  password?: string;
  pollingInterval?: number;
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

class FortiAnalyzerService {
  private baseUrl: string;
  private config: FortiAnalyzerConfig;
  private session: string | null = null;

  constructor(config: FortiAnalyzerConfig) {
    this.config = config;
    this.baseUrl = `https://${config.host}/jsonrpc`;
    // If accessToken provided, use directly as session (API key auth - no login needed)
    if (config.accessToken) {
      this.session = config.accessToken;
    }
  }

  /**
   * Login with username/password (with 15s timeout)
   */
  async login(): Promise<boolean> {
    // If using API key (accessToken), no login needed
    if (this.config.accessToken) {
      this.session = this.config.accessToken;
      return true;
    }

    try {
      console.log(`[FortiAnalyzer] Logging in as ${this.config.username}...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'exec',
          params: [{
            url: '/sys/login/user',
            data: {
              user: this.config.username,
              passwd: this.config.password,
            },
          }],
          id: 1,
        }),
      }).catch((err) => {
        clearTimeout(timeoutId);
        console.error('[FortiAnalyzer] Login request failed:', err.message);
        return null;
      });

      clearTimeout(timeoutId);
      if (!response) return false;

      const data = await response.json() as {
        result?: Array<{ status: { code: number; message: string } }>;
        session?: string;
      };

      const status = data.result?.[0]?.status;
      if (status?.code === 0 && data.session) {
        this.session = data.session;
        console.log('[FortiAnalyzer] Login successful');
        return true;
      }

      console.error(`[FortiAnalyzer] Login failed: code=${status?.code} msg=${status?.message}`);
      return false;
    } catch (error) {
      console.error('[FortiAnalyzer] Login failed:', error);
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
      const response = await fetch(this.baseUrl, {
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
        result?: Array<{ data: Record<string, unknown>; status: { code: number } }>;
      };

      if (data.result && data.result[0].status.code === 0) {
        return data.result[0].data;
      }
      return null;
    } catch (error) {
      console.error('Failed to get status:', error);
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
      const response = await fetch(this.baseUrl, {
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
        result?: Array<{ data: Array<Record<string, unknown>>; status: { code: number } }>;
      };

      if (data.result && data.result[0].status.code === 0) {
        return data.result[0].data;
      }
      return null;
    } catch (error) {
      console.error('Failed to get ADOMs:', error);
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
      console.log('Available devices for config logs:', devices);
      
      // Şimdilik boş döndürüyoruz, daha sonra geliştirilebilir
      return [];
    } catch (error) {
      console.error('Failed to get config logs:', error);
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
      console.log('Available devices for config revisions:', devices);
      
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
          admin: 'fcelebigil',
          comment: 'Interface configuration change',
          version: '1.0.0',
          device: 'FG4H0FT922903137'
        }
      ];
      
      return mockRevisions;
    } catch (error) {
      console.error('Failed to get config revisions:', error);
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
      const response = await fetch(this.baseUrl, {
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

      const data = await response.json();
      console.log('Devices raw response:', JSON.stringify(data, null, 2));

      if (data.result && Array.isArray(data.result)) {
        return data.result[0]?.data || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to get devices:', error);
      return [];
    }
  }

  /**
   * Start log search and get task ID
   */
  async startLogSearch(logtype: string = 'event', limit: number = 20, filter?: string): Promise<number | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    try {
      // Calculate time range: last 30 days, with +24h buffer on end to handle timezone diffs (UTC vs local)
      const now = new Date();
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const formatDate = (d: Date) => {
        return d.toISOString().slice(0, 19).replace('T', ' ');
      };

      const params: Record<string, unknown> = {
        url: '/logview/adom/root/logsearch',
        apiver: 3,
        device: [{ devid: 'All_FortiGate' }],
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
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(this.baseUrl, {
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
      }).catch((err) => {
        clearTimeout(timeoutId);
        console.error(`FortiAnalyzer ${logtype} search failed:`, err.message);
        return null;
      });

      clearTimeout(timeoutId);

      if (!response) return null;

      const data = await response.json() as {
        result?: { tid: number };
        error?: { code: number; message: string };
      };

      if (data.error) {
        console.error('Log search error:', data.error);
        return null;
      }

      return data.result?.tid || null;
    } catch (error) {
      console.error('Failed to start log search:', error);
      return null;
    }
  }

  /**
   * Fetch log search results by task ID
   */
  async fetchLogResults(tid: number, offset: number = 0, limit: number = 20): Promise<Array<Record<string, unknown>> | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    try {
      // Add AbortController timeout to prevent hanging fetch (was causing isCheckRunning to stay stuck)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(this.baseUrl, {
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
      }).catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          console.warn(`[FortiAnalyzer] fetchLogResults timed out (tid=${tid})`);
        } else {
          console.error('Failed to fetch log results:', err.message);
        }
        return null;
      });

      clearTimeout(timeoutId);
      if (!response) return null;

      // Also timeout the JSON parsing in case response body is truncated/slow
      const data = await Promise.race([
        response.json() as Promise<{
          result?: {
            data: Array<Record<string, unknown>>;
            status: { code: number; message: string };
          };
          error?: { code: number; message: string };
        }>,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);

      if (!data) {
        console.warn(`[FortiAnalyzer] fetchLogResults JSON parse timed out (tid=${tid})`);
        return null;
      }

      if (data.error) {
        console.error('Fetch logs error:', data.error);
        return null;
      }

      return data.result?.data || null;
    } catch (error) {
      console.error('Failed to fetch log results:', error);
      return null;
    }
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
      const addResponse = await fetch(this.baseUrl, {
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
        console.error(`FortiView ${viewName} add error:`, addData.error);
        return null;
      }
      if (Array.isArray(addData.result)) {
        const first = addData.result[0];
        if (first?.status && first.status.code !== 0) {
          console.error(`FortiView ${viewName} add status error:`, first.status);
          return null;
        }
        tid = first?.tid ?? null;
      } else if (addData.result && 'tid' in addData.result) {
        tid = addData.result.tid;
      }

      if (!tid) {
        console.error(`FortiView ${viewName} add: no tid in response:`, JSON.stringify(addData));
        return null;
      }

      console.log(`FortiView ${viewName}: task started with tid=${tid}`);

      // Step 2: Poll for results (max 60 seconds)
      for (let i = 0; i < 12; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const getResponse = await fetch(this.baseUrl, {
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
          console.error('FortiView get error:', getData.error);
          return null;
        }

        const result = getData.result;
        if (result && result.percentage >= 90 && result.data && result.data.length > 0) {
          console.log(`FortiView ${viewName}: completed at ${result.percentage}% with ${result.data.length} rows`);
          return {
            data: result.data,
            totalCount: result['total-count-all'],
          };
        }

        // Still processing, continue polling
        console.log(`FortiView ${viewName}: ${result?.percentage || 0}% complete...`);
      }

      console.warn(`FortiView ${viewName} timed out`);
      return null;
    } catch (error) {
      console.error(`Failed to get FortiView ${viewName}:`, error);
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

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      if (data.error) {
        console.error('[MITRE] Error in response:', data.error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[MITRE] Exception:', error);
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

      const response = await fetch(this.baseUrl, {
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

      const data = await response.json();
      if (data.error) {
        console.error(`MITRE Technique ${techId} get error:`, data.error);
        return null;
      }

      return data.result;
    } catch (error) {
      console.error(`Failed to get MITRE Technique ${techId}:`, error);
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
