/**
 * FortiAnalyzer Integration API Routes
 * 
 * GET /api/integrations/fortianalyzer?type=status - Get system status
 * GET /api/integrations/fortianalyzer?type=adoms - Get ADOMs
 */

import { NextRequest, NextResponse } from 'next/server';
import FortiAnalyzerService from '@/lib/integrations/fortianalyzer';
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
      data = await service.getConfigLogs(50);
      console.log('FortiAnalyzer config logs data:', JSON.stringify(data, null, 2));
    } else if (dataType === 'traffic') {
      const tid = await service.startLogSearch('traffic', 10);
      if (tid) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        data = await service.fetchLogResults(tid, 0, 10);
      }
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
