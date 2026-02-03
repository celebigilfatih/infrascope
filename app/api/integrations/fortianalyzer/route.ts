/**
 * FortiAnalyzer Integration API Routes
 * 
 * GET /api/integrations/fortianalyzer?type=events - Get event logs
 * GET /api/integrations/fortianalyzer?type=threats - Get threat logs
 * GET /api/integrations/fortianalyzer?type=traffic - Get traffic logs
 */

import { NextRequest, NextResponse } from 'next/server';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const logType = searchParams.get('type') || 'events';
    const limit = parseInt(searchParams.get('limit') || '20');

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
      accessToken: string;
      pollingInterval?: number;
    };

    const service = new FortiAnalyzerService({
      host: faConfig.host,
      accessToken: faConfig.accessToken,
      pollingInterval: faConfig.pollingInterval,
    });

    // Return logs based on type
    let logs = [];

    if (logType === 'events') {
      logs = await service.getEventLogs(limit);
    } else if (logType === 'threats') {
      logs = await service.getThreatLogs(limit);
    } else if (logType === 'traffic') {
      logs = await service.getTrafficLogs(limit);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid log type' },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      data: logs,
      type: logType,
      count: logs.length 
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
