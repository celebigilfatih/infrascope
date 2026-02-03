interface FortiAnalyzerConfig {
  host: string;
  accessToken: string;
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

  constructor(config: FortiAnalyzerConfig) {
    this.config = config;
    this.baseUrl = `https://${config.host}/api/v2`;
  }

  /**
   * Get recent event logs
   */
  async getEventLogs(limit: number = 20): Promise<EventLog[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/log/event?limit=${limit}&sort=-eventtime`,
        {
          headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        data: EventLog[];
      };

      return data.data || [];
    } catch (error) {
      console.error('Failed to get event logs:', error);
      return [];
    }
  }

  /**
   * Get threat logs
   */
  async getThreatLogs(limit: number = 20): Promise<EventLog[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/log/threat?limit=${limit}&sort=-eventtime`,
        {
          headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        data: EventLog[];
      };

      return data.data || [];
    } catch (error) {
      console.error('Failed to get threat logs:', error);
      return [];
    }
  }

  /**
   * Get traffic logs
   */
  async getTrafficLogs(limit: number = 20): Promise<EventLog[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/log/traffic?limit=${limit}&sort=-eventtime`,
        {
          headers: { 'Authorization': `Bearer ${this.config.accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as {
        data: EventLog[];
      };

      return data.data || [];
    } catch (error) {
      console.error('Failed to get traffic logs:', error);
      return [];
    }
  }
}

export default FortiAnalyzerService;
