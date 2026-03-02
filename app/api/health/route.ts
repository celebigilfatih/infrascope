/**
 * GET /api/health
 * Health check endpoint - starts and monitors alarm services
 * Auto-restarts services if they've stopped
 */

import { NextRequest, NextResponse } from 'next/server';
import { startAlarmScheduler, getSchedulerStatus } from '@/lib/alarm-scheduler';
import { startAlarmMonitor, getAlarmMonitor } from '@/lib/alarms/alarm-monitor';

/**
 * Ensure alarm services are running - starts them if stopped
 */
function ensureAlarmServicesRunning() {
  const schedulerStatus = getSchedulerStatus();
  const monitorStatus = getAlarmMonitor().getStatus();
  
  let schedulerOk = schedulerStatus.running;
  let monitorOk = monitorStatus.running;
  
  // Start scheduler if not running
  if (!schedulerOk) {
    console.log('[Health] Scheduler not running, starting...');
    try {
      startAlarmScheduler();
      schedulerOk = true;
      console.log('[Health] Alarm scheduler (re)started');
    } catch (err) {
      console.error('[Health] Failed to start scheduler:', err);
    }
  }
  
  // Start monitor if not running
  if (!monitorOk) {
    console.log('[Health] Monitor not running, starting...');
    try {
      startAlarmMonitor(5);
      monitorOk = true;
      console.log('[Health] Alarm monitor (re)started');
    } catch (err) {
      console.error('[Health] Failed to start monitor:', err);
    }
  }
  
  return { schedulerOk, monitorOk };
}

export async function GET(_request: NextRequest) {
  // Ensure alarm services are running (auto-restart if stopped)
  const { schedulerOk, monitorOk } = ensureAlarmServicesRunning();
  
  return NextResponse.json(
    {
      success: true,
      status: 'healthy',
      timestamp: new Date(),
      version: '1.0.0',
      services: {
        scheduler: schedulerOk,
        monitor: monitorOk,
      },
    },
    { status: 200 }
  );
}
