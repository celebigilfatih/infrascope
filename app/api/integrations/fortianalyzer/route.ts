/**
 * FortiAnalyzer Integration API Routes
 * 
 * GET /api/integrations/fortianalyzer?type=status - Get system status
 * GET /api/integrations/fortianalyzer?type=adoms - Get ADOMs
 */

import { NextRequest, NextResponse } from 'next/server';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { FortiGateService } from '@/lib/integrations/fortigate';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get('type') || 'status';

    // Get FortiAnalyzer configuration from database
    const config = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    if (!config) {
      return NextResponse.json({
        success: false,
        error: 'FortiAnalyzer integration not configured',
      });
    }

    const faConfig = config.config as {
      host: string;
      username?: string;
      password?: string;
    };

    const service = new FortiAnalyzerService({
      host: faConfig.host,
      username: faConfig.username || 'fcelebigil',
      password: faConfig.password || 'Thor.7485-a',
    });

    // Login first
    const loggedIn = await service.login();
    if (!loggedIn) {
      return NextResponse.json({
        success: false,
        error: 'Failed to login to FortiAnalyzer',
      });
    }

    // Return data based on type
    let data = null;

    if (dataType === 'status') {
      data = await service.getStatus();
    } else if (dataType === 'adoms') {
      data = await service.getAdoms();
    } else if (dataType === 'events') {
      data = await service.getEventLogs(50);
      console.log('FortiAnalyzer event logs data:', JSON.stringify(data, null, 2));
    } else if (dataType === 'config-revisions') {
      // Admin system logs from FortiAnalyzer (login/logout, config changes - exclude perf-stats)
      const tid = await service.startLogSearch('event', 1000, 'subtype == system and action != perf-stats');
      if (tid) {
        await new Promise(resolve => setTimeout(resolve, 6000));
        data = await service.fetchLogResults(tid, 0, 500);
      } else {
        data = [];
      }
    } else if (dataType === 'traffic') {
      const tid = await service.startLogSearch('traffic', 10);
      if (tid) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        data = await service.fetchLogResults(tid, 0, 10);
      }
    } else if (dataType === 'fortiview') {
      // Single FortiView query
      const viewName = searchParams.get('view') || 'top-websites';
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const sortField = searchParams.get('sort') || 'bandwidth';
      const rangeMinutes = parseInt(searchParams.get('range') || '240', 10);
      const result = await service.getFortiView(viewName, limit, { field: sortField, order: 'desc' }, undefined, rangeMinutes);
      if (result) {
        return NextResponse.json({
          success: true,
          data: result.data,
          totalCount: result.totalCount,
          type: dataType,
          view: viewName,
        });
      }
      return NextResponse.json({ success: true, data: [], type: dataType, view: viewName });
    } else if (dataType === 'fortiview-batch') {
      // Batch FortiView: single login, multiple views sequentially
      const viewsParam = searchParams.get('views') || 'top-websites,top-browsing-users,policy-hits';
      const views = viewsParam.split(',');
      const limit = parseInt(searchParams.get('limit') || '50', 10);
      const sortField = searchParams.get('sort') || 'bandwidth';
      const rangeMinutes = parseInt(searchParams.get('range') || '240', 10);

      const results: Record<string, { data: Array<Record<string, unknown>>; totalCount?: number }> = {};
      for (const viewName of views) {
        try {
          const result = await service.getFortiView(viewName.trim(), limit, { field: sortField, order: 'desc' }, undefined, rangeMinutes);
          results[viewName.trim()] = result || { data: [] };
        } catch (err) {
          console.error(`FortiView batch error for ${viewName}:`, err);
          results[viewName.trim()] = { data: [] };
        }
      }
      return NextResponse.json({ success: true, results, type: dataType });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid data type' },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data,
      type: dataType,
    });
  } catch (error) {
    console.error('FortiAnalyzer API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: (error as Error).message 
      },
      { status: 500 }
    );
  }
}
