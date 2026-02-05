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
  }

  /**
   * Login with username/password
   */
  async login(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      });

      const data = await response.json() as {
        result?: Array<{ status: { code: number; message: string } }>;
        session?: string;
      };

      if (data.result && data.result[0].status.code === 0 && data.session) {
        this.session = data.session;
        return true;
      }
      return false;
    } catch (error) {
      console.error('FortiAnalyzer login failed:', error);
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
   * Start log search and get task ID
   */
  async startLogSearch(logtype: string = 'event', limit: number = 20): Promise<number | null> {
    if (!this.session) {
      const loggedIn = await this.login();
      if (!loggedIn) return null;
    }

    try {
      // Calculate time range (last 24 hours)
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      
      const formatDate = (d: Date) => {
        return d.toISOString().slice(0, 19).replace('T', ' ');
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'add',
          params: [{
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
          }],
          session: this.session,
          id: 10,
        }),
      });

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
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const data = await response.json() as {
        result?: {
          data: Array<Record<string, unknown>>;
          status: { code: number; message: string };
        };
        error?: { code: number; message: string };
      };

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
