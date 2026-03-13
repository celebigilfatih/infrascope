/**
 * GET /api/changes - Fetch recent configuration changes from firewall and VMware
 * Query params:
 *   - limit: number of changes to return (default 30)
 *   - source: 'all' | 'firewall' | 'vmware' (default 'all')
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import FortiGateService from '@/lib/integrations/fortigate';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import VMwareService from '@/lib/integrations/vmware';

interface Change {
  id: string;
  type: 'create' | 'update' | 'delete' | 'config';
  source: 'firewall' | 'vmware';
  entity: string;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
  user: string;
  timestamp: string;
  description?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const source = searchParams.get('source') || 'all';

    const changes: Change[] = [];

    // Fetch FortiGate config revisions
    if (source === 'all' || source === 'firewall') {
      try {
        // Load FortiGate config from DB (fixes 'new FortiGateService()' without args bug)
        const fgConfig = await prisma.integrationConfig.findFirst({
          where: { type: 'FORTIGATE' as any, enabled: true },
        });

        if (fgConfig?.config) {
          const fortiConfig = fgConfig.config as any;
          const fgService = new FortiGateService({
            host: fortiConfig.host,
            accessToken: fortiConfig.accessToken,
            pollingInterval: fortiConfig.pollingInterval || 15,
            syncMode: fortiConfig.syncMode || 'rest',
            enabledModules: fortiConfig.enabledModules,
          });

          const result = await fgService.getConfigRevisions();
          const revisions = result?.revisions;

          if (revisions && Array.isArray(revisions)) {
            const EXCLUDED_AUTHORS = ['siem', 'ansible', 'puppet', 'chef', 'terraform', 'automation'];
            revisions
              .filter((rev: any) => {
                const author = (rev.admin || rev.author || '').toLowerCase();
                return !EXCLUDED_AUTHORS.some(excluded => author.includes(excluded));
              })
              .slice(0, Math.floor(limit / 2))
              .forEach((rev: any, idx: number) => {
                const author = rev.admin || rev.author || 'admin';
                changes.push({
                  id: `fg-${rev.id || idx}`,
                  type: 'config',
                  source: 'firewall',
                  entity: 'firewall-config',
                  entityName: author,
                  field: 'configuration',
                  oldValue: '-',
                  newValue: rev.comment || 'Config change',
                  user: author,
                  timestamp: new Date(rev.time * 1000).toISOString(),
                  description: rev.comment,
                });
              });
          }
        } else {
          console.warn('[Changes API] FortiGate integration not configured in DB');
        }
      } catch (fgErr) {
        console.error('[Changes API] FortiGate error:', fgErr);
      }
    }

    // Fetch FortiAnalyzer system event logs (config changes, admin actions)
    if (source === 'all' || source === 'firewall') {
      try {
        // Get FortiAnalyzer config from database
        const faConfig = await prisma.integrationConfig.findFirst({
          where: { type: 'FORTIANALYZER', enabled: true },
        });

        if (faConfig && faConfig.config) {
          const config = faConfig.config as {
            host: string;
            username?: string;
            password?: string;
          };

          const faService = new FortiAnalyzerService({
            host: config.host,
            username: config.username || 'infrascope',
            password: config.password || 'Thor.7485-app',
          });

          const loggedIn = await faService.login();
          if (loggedIn) {
            // Fixed filter: quoted %attribute% wildcard for FA API
            const tid = await faService.startLogSearch(
              'event',
              limit,
              "subtype == 'system' and (logdesc like '%attribute%' or action == 'login' or action == 'logout')"
            );

            if (tid) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              const logs = await faService.fetchLogResults(tid, 0, limit);

              if (logs && Array.isArray(logs)) {
                const EXCLUDED_USERS = ['siem', 'ansible', 'puppet', 'chef', 'terraform', 'automation'];
                const filteredLogs = logs.filter((log: any) => {
                  const user = (log.user || log.admin || '').toLowerCase();
                  return !EXCLUDED_USERS.some(excluded => user.includes(excluded));
                });

                filteredLogs.forEach((log: any, idx: number) => {
                  const action = log.action || 'unknown';
                  let type: 'create' | 'update' | 'delete' | 'config' = 'config';
                  let description = log.msg ? decodeURIComponent(String(log.msg).replace(/%20/g, ' ')) : log.logdesc;

                  if (action === 'login') {
                    type = 'create';
                    description = `Admin login: ${log.user || 'unknown'}`;
                  } else if (action === 'logout') {
                    type = 'delete';
                    description = `Admin logout: ${log.user || 'unknown'}`;
                  } else if (log.logdesc && log.logdesc.includes('attribute')) {
                    type = 'update';
                  }

                  changes.push({
                    id: `fa-${log.id || idx}`,
                    type,
                    source: 'firewall',
                    entity: 'firewall-event',
                    entityName: log.devname || 'FortiGate',
                    field: log.cfgpath || log.logdesc || '-',
                    oldValue: '-',
                    newValue: log.cfgobj || description || '-',
                    user: log.user || log.admin || 'system',
                    timestamp: log.itime ? new Date(log.itime).toISOString() : new Date().toISOString(),
                    description,
                  });
                });
              }
            }
          }
        }
      } catch (faErr) {
        console.error('[Changes API] FortiAnalyzer error:', faErr);
      }
    }

    // VMware vCenter events via SOAP (logins, VM operations, config changes)
    if (source === 'all' || source === 'vmware') {
      try {
        const vmConfig = await prisma.integrationConfig.findFirst({
          where: { type: 'VMWARE_VCENTER', enabled: true },
        });

        if (vmConfig?.config) {
          const cfg = vmConfig.config as any;
          const vmService = new VMwareService({
            host: cfg.host,
            username: cfg.username,
            password: cfg.password,
            thumbprint: cfg.thumbprint,
            pollingInterval: cfg.pollingInterval || 15,
            enabledModules: cfg.enabledModules || {
              datacenters: true, clusters: true, hosts: true, vms: true, datastores: true,
            },
          });

          const soapAuth = await vmService.authenticateSOAP();
          if (soapAuth) {
            // Fetch last 24h of events (1440 min)
            const events = await vmService.queryEventsSOAP(1440);

            const EXCLUDED_USERS = ['siem', 'ansible', 'puppet', 'chef', 'terraform', 'automation', ''];

            events
              .filter((evt: any) => {
                const user = (evt.userName || '').toLowerCase();
                return !EXCLUDED_USERS.some(ex => user === ex || (ex && user.includes(ex)));
              })
              .slice(0, Math.ceil(limit / 2))
              .forEach((evt: any, idx: number) => {
                let type: 'create' | 'update' | 'delete' | 'config' = 'config';
                let entity = 'vcenter-event';
                let description = evt.message || evt.eventType;

                const evtType = evt.eventType || '';
                if (evtType.includes('Created') || evtType === 'UserLoginSessionEvent') {
                  type = 'create';
                } else if (evtType.includes('Removed') || evtType.includes('Deleted') || evtType === 'UserLogoutSessionEvent') {
                  type = 'delete';
                } else if (evtType.includes('Reconfigured') || evtType.includes('Changed') || evtType === 'EventEx') {
                  type = 'update';
                  entity = 'vcenter-config';
                }

                if (evtType === 'UserLoginSessionEvent') {
                  entity = 'vcenter-session';
                  description = `vCenter login: ${evt.userName}`;
                } else if (evtType === 'UserLogoutSessionEvent') {
                  entity = 'vcenter-session';
                  description = `vCenter logout: ${evt.userName}`;
                } else if (evt.vmName) {
                  entity = 'vm';
                  description = `${evtType.replace(/Event$/, '')}: ${evt.vmName}`;
                }

                changes.push({
                  id: `vc-${evt.eventId || idx}`,
                  type,
                  source: 'vmware',
                  entity,
                  entityName: evt.vmName || evt.userName || 'vCenter',
                  field: evtType,
                  oldValue: '-',
                  newValue: description,
                  user: evt.userName || 'system',
                  timestamp: evt.createdTime || new Date().toISOString(),
                  description,
                });
              });
          }
        } else {
          console.warn('[Changes API] VMware vCenter integration not configured in DB');
        }
      } catch (vmErr) {
        console.error('[Changes API] VMware error:', vmErr);
      }
    }

    // Sort by timestamp descending
    changes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      success: true,
      data: changes.slice(0, limit),
      total: changes.length,
    });
  } catch (error) {
    console.error('[Changes API] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
