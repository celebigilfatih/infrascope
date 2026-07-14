/**
 * POST /api/alarms/check-vmware - Trigger VMware-only alarm evaluation
 * Faster than full alarm check - only evaluates VMware snapshot/VM alarms
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import FortiAnalyzerService, { initSharedFortiAnalyzerService } from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine } from '@/lib/alarms/detection-engine';
import { unprotectIntegrationConfig } from '@/lib/security/integration-credentials';

async function runVMwareAlarmCheck() {
  try {
    // Get FortiAnalyzer config (required for AlarmDetectionEngine constructor)
    const faConfig = await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    });

    if (!faConfig) {
      return { success: false, error: 'FortiAnalyzer not configured' };
    }

    const config = unprotectIntegrationConfig<{
      host: string;
      username?: string;
      password?: string;
    }>(faConfig.config, 'FORTIANALYZER');

    if (!config.password) {
      return { success: false, error: 'FortiAnalyzer password not configured' };
    }

    const service = initSharedFortiAnalyzerService({
      host: config.host,
      username: config.username,
      password: config.password,
    });

    // Create alarm engine
    const engine = new AlarmDetectionEngine(service);
    
    // Get only VMware alarms from database
    const vmwareAlarms = await prisma.alarmDefinition.findMany({
      where: { 
        enabled: true,
        detectionLogic: {
          path: ['logtype'],
          equals: 'vmware'
        }
      },
    });
    
    if (vmwareAlarms.length === 0) {
      return {
        success: true,
        message: 'No VMware alarms enabled',
        summary: { total: 0, triggered: 0, errors: 0 },
        triggered: [],
        errors: []
      };
    }
    
    console.log(`[VMwareAlarmCheck] Found ${vmwareAlarms.length} VMware alarms to evaluate`);
    
    // Initialize VMware service
    // @ts-ignore - accessing private method
    await engine.initializeVMware();
    
    // Evaluate VMware alarms using the private evaluateLogTypeGroup method
    console.log('[VMwareAlarmCheck] Evaluating VMware alarms...');
    // @ts-ignore - accessing private method
    const results = await engine.evaluateLogTypeGroup('vmware', vmwareAlarms);

    const triggered = results.filter((r) => r.triggered);
    const errors = results.filter((r) => r.error && r.error !== 'cooldown-active');

    console.log(
      `[VMwareAlarmCheck] Complete: ${results.length} VMware alarms evaluated, ` +
      `${triggered.length} triggered, ${errors.length} errors`
    );

    if (triggered.length > 0) {
      console.log('[VMwareAlarmCheck] Triggered alarms:', triggered.map(r => r.alarmCode).join(', '));
    }

    return {
      success: true,
      summary: {
        total: results.length,
        triggered: triggered.length,
        errors: errors.length,
      },
      triggered: triggered.map((r) => ({
        code: r.alarmCode,
        matchCount: r.matchCount,
        sampleEvents: r.events.slice(0, 2),
      })),
      errors: errors.map((r) => ({ code: r.alarmCode, error: r.error })),
    };
  } catch (error) {
    console.error('[VMwareAlarmCheck] Fatal error:', error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export async function POST() {
  try {
    const result = await runVMwareAlarmCheck();
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[VMwareAlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await runVMwareAlarmCheck();
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[VMwareAlarmCheck] Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
