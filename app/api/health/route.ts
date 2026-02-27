/**
 * GET /api/health
 * Health check endpoint - also starts alarm services on first call
 */

import { NextRequest, NextResponse } from 'next/server';
import { startAlarmScheduler } from '@/lib/alarm-scheduler';
import { startAlarmMonitor } from '@/lib/alarms/alarm-monitor';

// Track if services have been initialized
let servicesInitialized = false;

function initializeAlarmServices() {
  if (servicesInitialized) return;
  
  console.log('[Health] Initializing alarm services...');
  
  try {
    // Start scheduler (runs every 15 minutes)
    startAlarmScheduler();
    console.log('[Health] Alarm scheduler started');
  } catch (err) {
    console.error('[Health] Failed to start scheduler:', err);
  }
  
  try {
    // Start monitor (runs every 5 minutes)
    startAlarmMonitor(5);
    console.log('[Health] Alarm monitor started');
  } catch (err) {
    console.error('[Health] Failed to start monitor:', err);
  }
  
  servicesInitialized = true;
}

export async function GET(_request: NextRequest) {
  // Initialize alarm services on first health check
  initializeAlarmServices();
  
  return NextResponse.json(
    {
      success: true,
      status: 'healthy',
      timestamp: new Date(),
      version: '1.0.0',
      services: {
        scheduler: true,
        monitor: true,
      },
    },
    { status: 200 }
  );
}
