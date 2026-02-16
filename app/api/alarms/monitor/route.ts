/**
 * POST /api/alarms/monitor - Start/stop/status alarm monitoring service
 * GET  /api/alarms/monitor - Get monitor status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAlarmMonitor, startAlarmMonitor, stopAlarmMonitor } from '@/lib/alarms/alarm-monitor';

export async function GET() {
  try {
    const monitor = getAlarmMonitor();
    const status = monitor.getStatus();
    
    return NextResponse.json({
      success: true,
      monitor: status,
    });
  } catch (error) {
    console.error('[MonitorAPI] Error getting status:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, intervalMinutes } = body;

    if (action === 'start') {
      const interval = intervalMinutes || 5;
      const monitor = startAlarmMonitor(interval);
      const status = monitor.getStatus();
      
      return NextResponse.json({
        success: true,
        message: `Alarm monitor started with ${interval} minute interval`,
        monitor: status,
      });
    } else if (action === 'stop') {
      stopAlarmMonitor();
      
      return NextResponse.json({
        success: true,
        message: 'Alarm monitor stopped',
      });
    } else if (action === 'force-check') {
      const monitor = getAlarmMonitor();
      await monitor.forceCheck();
      
      return NextResponse.json({
        success: true,
        message: 'Manual check completed',
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Use: start, stop, or force-check' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[MonitorAPI] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
