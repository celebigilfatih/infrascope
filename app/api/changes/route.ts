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
        const fgService = new FortiGateService();
        const revisions = await fgService.getConfigRevisions();
        
        if (revisions && Array.isArray(revisions)) {
          const EXCLUDED_AUTHORS = ['siem', 'ansible', 'puppet', 'chef', 'terraform', 'automation'];
          revisions
            .filter((rev: any) => {
              const author = (rev.author || '').toLowerCase();
              return !EXCLUDED_AUTHORS.some(excluded => author.includes(excluded));
            })
            .slice(0, Math.floor(limit / 2)).forEach((rev: any, idx: number) => {
            changes.push({
              id: `fg-${rev.serial || idx}`,
              type: 'config',
              source: 'firewall',
              entity: 'firewall-config',
              entityName: rev.author || 'FortiGate',
              field: 'configuration',
              oldValue: '-',
              newValue: rev.comment || 'Config change',
              user: rev.author || 'admin',
              timestamp: new Date(rev.time * 1000).toISOString(),
              description: rev.comment,
            });
          });
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
            username: config.username || 'fcelebigil',
            password: config.password || 'Thor.7485-a',
          });

          const loggedIn = await faService.login();
          if (loggedIn) {
            const tid = await faService.startLogSearch(
              'event',
              limit,
              'subtype == system and (logdesc like %attribute% or action == login or action == logout)'
            );

            if (tid) {
              await new Promise((resolve) => setTimeout(resolve, 5000));
              const logs = await faService.fetchLogResults(tid, 0, limit);

              if (logs && Array.isArray(logs)) {
                // Exclude automated service accounts from change history
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

    // TODO: Add VMware vCenter changes when vCenter events API is ready
    // if (source === 'all' || source === 'vmware') {
    //   try {
    //     const vmService = new VMwareService();
    //     const events = await vmService.getRecentEvents();
    //     // Map vCenter events to changes format
    //   } catch (vmErr) {
    //     console.error('[Changes API] VMware error:', vmErr);
    //   }
    // }

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
