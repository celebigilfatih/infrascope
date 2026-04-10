/**
 * GET /api/alarms/cmdb-status
 * 
 * Diagnostic endpoint to check CMDB snapshot status for FortiGate config change detection.
 * Shows which CMDB endpoints have been snapshotted and when they were last checked.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Access the detection engine's FortiGate service
    const engine = (globalThis as any).__detectionEngine;
    
    if (!engine) {
      return NextResponse.json({
        success: false,
        error: 'Detection engine not initialized',
        hint: 'Call /api/health first to initialize the engine',
      }, { status: 503 });
    }

    const fgService = engine.fortiGateService;
    
    if (!fgService) {
      return NextResponse.json({
        success: false,
        error: 'FortiGate service not initialized',
        hint: 'Check database for enabled FORTIGATE integration config',
      }, { status: 503 });
    }

    // Get CMDB snapshot status
    const cmdbEndpoints = [
      '/cmdb/firewall/policy',
      '/cmdb/firewall/vip',
      '/cmdb/system/admin',
      '/cmdb/router/static',
      '/cmdb/vpn.ipsec/phase1-interface',
      '/cmdb/vpn.ssl/settings',
      '/cmdb/user/ldap',
      '/cmdb/system/interface',
      '/cmdb/firewall/address',
      '/cmdb/firewall/addrgrp',
      '/cmdb/system/accprofile',
    ];

    const snapshotStatus: Record<string, any> = {};

    for (const endpoint of cmdbEndpoints) {
      const snapshot = fgService.getCmdbSnapshot(endpoint);
      snapshotStatus[endpoint] = {
        hasSnapshot: snapshot !== null,
        snapshotTime: snapshot?.timestamp || null,
        itemCount: snapshot?.data ? (Array.isArray(snapshot.data) ? snapshot.data.length : Object.keys(snapshot.data).length) : 0,
      };
    }

    return NextResponse.json({
      success: true,
      fortiGate: {
        host: fgService.config?.host || 'unknown',
        connected: true,
      },
      cmdbSnapshots: snapshotStatus,
      totalEndpoints: cmdbEndpoints.length,
      snapshottedEndpoints: Object.values(snapshotStatus).filter((s: any) => s.hasSnapshot).length,
    });
  } catch (error) {
    console.error('[CMDB Status] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}
