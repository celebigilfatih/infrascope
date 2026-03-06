/**
 * Alarm Scheduler Management API
 * GET  /api/alarms/scheduler - Get scheduler status
 * POST /api/alarms/scheduler/start - Start the scheduler
 * POST /api/alarms/scheduler/stop - Stop the scheduler
 * 
 * NOTE: Scheduler is auto-started in /api/health endpoint on server startup.
 * This route is for manual management only.
 */

import { NextResponse } from 'next/server';
import { startAlarmScheduler, stopAlarmScheduler, getSchedulerStatus } from '@/lib/alarm-scheduler';

export async function GET() {
  try {
    const status = getSchedulerStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const alreadyRunning = getSchedulerStatus().running;
    
    if (alreadyRunning) {
      return NextResponse.json({
        success: false,
        message: 'Scheduler is already running',
        status: getSchedulerStatus(),
      });
    }

    startAlarmScheduler();
    
    return NextResponse.json({
      success: true,
      message: 'Alarm scheduler started',
      status: getSchedulerStatus(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
