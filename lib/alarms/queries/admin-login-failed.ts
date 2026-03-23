/**
 * ADMIN_LOGIN_FAILED — Direct FortiGate query for failed admin login attempts
 * 
 * This query bypasses FortiAnalyzer and queries FortiGate REST API directly
 * for failed login events from the system event log.
 * 
 * FortiGate API Endpoint: GET /monitor/log/current
 * Filter: action=login AND status=failed
 */

import { runAlarmQuery } from './base';
import type { AlarmQueryContext, QueryResult } from './types';

export interface AdminLoginFailEvent {
  user: string;
  srcip: string;
  timestamp: number;
  action: string;
  status: string;
  msg?: string;
}

/**
 * Query FortiGate directly for failed admin login attempts
 */
async function getFortiGateAdminLoginFails(ctx: AlarmQueryContext): Promise<QueryResult> {
  const description = 'fortigate://admin/login/failed';
  
  try {
    // Get FortiGate service instance
    const detectionEngine = (globalThis as any).__detectionEngine;
    if (!detectionEngine || !detectionEngine.fortiGateService) {
      console.warn('[AlarmQuery] FortiGate service not available');
      return { events: [], error: 'fortigate-service-unavailable' };
    }

    const fortigate = detectionEngine.fortiGateService;
    
    // Fetch admin login events from FortiGate
    const loginEvents = await fortigate.getAdminLoginEvents();
    
    // Filter for failed logins within time window
    const now = Date.now() / 1000;
    const windowSeconds = ctx.timeWindowMinutes * 60;
    const cutoff = now - windowSeconds;
    
    const failedLogins = loginEvents.filter((event: any) => {
      const isFailed = event.action === 'login' && event.status === 'failed';
      const isInWindow = event.timestamp && event.timestamp >= cutoff;
      return isFailed && isInWindow;
    }) as AdminLoginFailEvent[];

    console.log(`[AlarmQuery] FortiGate: Found ${failedLogins.length} failed admin logins in last ${ctx.timeWindowMinutes}min`);

    return {
      events: failedLogins.map(event => ({
        rawLog: {
          user: event.user,
          srcip: event.srcip,
          action: event.action,
          status: event.status,
          msg: event.msg || 'Admin login failed',
          subtype: 'system',
          logdesc: 'Admin login failed',
        },
        timestamp: event.timestamp,
      })),
    };
  } catch (error) {
    console.error('[AlarmQuery] FortiGate admin login query failed:', error);
    return { events: [], error: (error as Error).message };
  }
}

/**
 * ADMIN_LOGIN_FAILED alarm query wrapper
 */
export async function getAdminLoginFailedEvents(ctx: AlarmQueryContext): Promise<QueryResult> {
  return getFortiGateAdminLoginFails(ctx);
}
