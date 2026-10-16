/** Shared alarm runner: atomic database ownership with finite, fenced execution. */
import { prisma as sharedPrisma } from '@/lib/prisma';
import { alarmExecutionPrisma } from './execution-prisma';
import { assertAlarmExecutionActive, withAlarmExecution } from './execution-context';
import { claimAlarmRun, createAlarmExecution, finishAlarmRun, reconcileAlarmRuns, ALARM_RUN_TIMEOUT_MS } from './run-lease';
import { initSharedFortiAnalyzerService, getFortiAnalyzerLoginHealth } from '@/lib/integrations/fortianalyzer';
import { AlarmDetectionEngine, type EvaluationResult } from '@/lib/alarms/detection-engine';
import { processDLQ, cleanupDLQ, getDLQStats } from '@/lib/notifications/dlq-worker';
import { sendAlarmEmail } from '@/lib/notifications/email';
import { createLogger } from '@/lib/logger';
import { initLicense, isLicenseValid } from '@/lib/license/client';
import { readFortiAnalyzerProfile } from '@/lib/integrations/fortianalyzer-source';
import { fortiAnalyzerRevision as getFortiAnalyzerRevision } from '@/lib/integrations/fortianalyzer-revision';

const log = createLogger('alarm-runner');
const prisma = alarmExecutionPrisma(sharedPrisma);

// ── FA health alert throttle ───────────────────────────────────────────────
const FA_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between FA health alerts
let lastFAAlertTime = 0;

async function maybeSendFAHealthAlert(): Promise<void> {
  const health = getFortiAnalyzerLoginHealth();
  if (health.consecutiveFailures < 3) return; // Not yet concerning
  if (Date.now() - lastFAAlertTime < FA_ALERT_COOLDOWN_MS) return; // Already alerted recently

  lastFAAlertTime = Date.now();
  const subject = health.isAccountLocked
    ? `[🔒 FA LOCKED] FortiAnalyzer account locked — action required`
    : `[⚠️ FA DOWN] FortiAnalyzer unreachable — alarm detection impaired`;

  const bodyLines = [
    `FortiAnalyzer login has failed ${health.consecutiveFailures} consecutive time(s).`,
    health.isAccountLocked
      ? `The infrascope account is LOCKED (code=-22). Unlock via: FortiAnalyzer GUI → System → Administrators → infrascope → Unlock.`
      : `FA may be unreachable or credentials may have changed.`,
    `Backoff remaining: ${health.backoffRemainingSec}s`,
    health.lastFailureAt ? `Last failure: ${health.lastFailureAt.toISOString()}` : '',
    `\nImpact: Alarm detection is running on stale/cached data. New security events may not be detected until FA connection is restored.`,
  ].filter(Boolean).join('\n');

  try {
    await sendAlarmEmail({
      alarmCode: 'SYSTEM_HEALTH',
      alarmName: health.isAccountLocked ? 'FortiAnalyzer Account Locked' : 'FortiAnalyzer Unreachable',
      severity: health.isAccountLocked ? 'ALARM_CRITICAL' : 'ALARM_HIGH',
      category: 'SYSTEM',
      title: subject,
      message: bodyLines,
      timestamp: new Date(),
    }, { bypassCooldown: true });
    log.warn({ consecutiveFailures: health.consecutiveFailures }, 'FA health alert sent');
  } catch (err) {
    log.error({ err }, 'Failed to send FA health alert');
  }
}

export interface AlarmCheckResult {
  success: boolean;
  error?: string;
  summary: {
    total: number;
    triggered: number;
    skippedCooldown: number;
    errors: number;
  };
  metrics?: {
    durationMs: number;
    alarmsPerSecond: number;
    severityBreakdown: Record<string, { triggered: number; errors: number }>;
    categoryBreakdown: Record<string, { triggered: number; total: number }>;
  };
  triggered: Array<{
    code: string;
    matchCount: number;
    sampleEvents: Array<Record<string, unknown>>;
    target?: EvaluationResult['target'];
  }>;
  errors: Array<{ code: string; error: string | undefined; target?: EvaluationResult['target'] }>;
}

type CheckOptions = { sources?: import('./detection-engine').AlarmSource[]; requireConfiguredSources?: boolean };
const globalRunner = globalThis as typeof globalThis & { __infrascopeAlarmRunner?: { busy: boolean; lastResult: AlarmCheckResult | null } };
function state() { return globalRunner.__infrascopeAlarmRunner ??= { busy: false, lastResult: null }; }
export function getLastAlarmCheckResult() { return state().lastResult; }
export async function initializeAlarmRunner(): Promise<void> {
  try { await reconcileAlarmRuns(); }
  catch (error) { log.warn({ err: error }, 'Alarm ownership reconciliation unavailable; claims remain fail closed'); }
}
function failed(error: string, code = 'SYSTEM_ERROR'): AlarmCheckResult {
  return { success: false, error, summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 1 }, triggered: [], errors: [{ code, error }] };
}
function busy(): AlarmCheckResult {
  return { success: false, error: 'Check already in progress', summary: { total: 0, triggered: 0, skippedCooldown: 0, errors: 0 }, triggered: [], errors: [] };
}
export async function runAlarmCheck(options: CheckOptions = {}): Promise<AlarmCheckResult> {
  const current = state();
  if (current.busy) return busy();
  current.busy = true;
  const startTime = Date.now();
  let claim: Awaited<ReturnType<typeof claimAlarmRun>> = null;
  let scope: ReturnType<typeof createAlarmExecution> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    claim = await claimAlarmRun();
    if (!claim) return busy();
    scope = createAlarmExecution(claim);
    const active = scope;
    const result = await Promise.race([
      withAlarmExecution(active.execution, () => evaluateAlarmRun(options, startTime)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { active.cancel(); reject(new Error('Alarm evaluation timeout (10 minutes)')); }, ALARM_RUN_TIMEOUT_MS);
      }),
    ]);
    active.execution.assertActive();
    await finishAlarmRun(claim, { totalAlarms: result.summary.total, triggeredCount: result.summary.triggered,
      errorCount: result.summary.errors, durationMs: Date.now() - startTime,
      status: (options.sources ? 'SOURCE_' : '') + (result.summary.errors ? 'PARTIAL' : 'SUCCESS') }, active.execution);
    if (!options.sources) current.lastResult = result;
    return result;
  } catch (error) {
    scope?.cancel();
    log.error({ err: error }, 'Alarm execution failed');
    if (claim) {
      try { await finishAlarmRun(claim, { totalAlarms: 0, triggeredCount: 0, errorCount: 1,
        durationMs: Date.now() - startTime, status: options.sources ? 'SOURCE_FAILED' : 'FAILED' }); }
      catch (failure) { log.error({ err: failure }, 'Alarm finalization unavailable or ownership lost'); }
    }
    return failed((error as Error).message, (error as Error).message === 'License validation failed' ? 'LICENSE' : 'SYSTEM_ERROR');
  } finally {
    scope?.cancel();
    if (timer !== undefined) clearTimeout(timer);
    current.busy = false;
  }
}
async function evaluateAlarmRun(options: CheckOptions, startTime: number): Promise<AlarmCheckResult> {
  await initLicense();
  assertAlarmExecutionActive();
  if (!isLicenseValid()) throw new Error('License validation failed');
  const sourceErrors: Array<{ code: string; error: string }> = [];
  let fortiAnalyzerConfigured = false;

  const combined: EvaluationResult[] = [];

  assertAlarmExecutionActive();
  try {
    const nmsEngine = new AlarmDetectionEngine(null);
    if (!options.sources || options.sources.includes('nms')) combined.push(...await nmsEngine.evaluateNmsAlarms());
  } catch (error) {
    const message = (error as Error).message;
    sourceErrors.push({ code: 'NMS_SOURCE', error: message });
    log.error({ err: error }, 'NMS alarm source failed');
  }

  assertAlarmExecutionActive();
  let service: ReturnType<typeof initSharedFortiAnalyzerService> | null = null;
  let fortiAnalyzerConfigId: string | undefined;
  let fortiAnalyzerRevision: string | undefined;
  assertAlarmExecutionActive();
  try {
    const config = !options.sources || options.sources.includes('fortianalyzer') ? await prisma.integrationConfig.findFirst({
      where: { type: 'FORTIANALYZER', enabled: true },
    }) : null;
    if (config) {
      fortiAnalyzerConfigured = true;
      fortiAnalyzerConfigId = config.id;
      fortiAnalyzerRevision = getFortiAnalyzerRevision(config);
      service = initSharedFortiAnalyzerService(readFortiAnalyzerProfile(config.config));
    } else {
      log.info({ source: 'FORTIANALYZER', reason: 'not-configured' }, 'Skipping optional alarm source');
    }
  } catch (error) {
    sourceErrors.push({ code: 'FORTIANALYZER_SOURCE', error: (error as Error).message });
    log.error({ err: error }, 'FortiAnalyzer configuration failed; continuing independent sources');
  }

  // The existing engine dispatches VMware/FG even when FA could not initialize.
  // NMS already ran above and must not be evaluated twice.
  assertAlarmExecutionActive();
  try {
    const engine = new AlarmDetectionEngine(service, { fortiAnalyzerConfigId, fortiAnalyzerRevision });
    combined.push(...await engine.evaluateAllAlarms({ includeNms: false, ...options }));
  } catch (error) {
    sourceErrors.push({ code: 'ALARM_ENGINE', error: (error as Error).message });
    log.error({ err: error }, 'Alarm engine failed; preserving independent results');
  }

  const results = combined;
  assertAlarmExecutionActive();
  const triggered = results.filter((r) => r.triggered);
  const resultErrors = results.filter((r) => r.error && r.error !== 'cooldown-active');
  const errors = [
    ...resultErrors.map((result) => ({ code: result.alarmCode, error: result.error,
      ...(result.target ? { target: result.target } : {}) })),
    ...sourceErrors,
  ];
  const cooldowns = results.filter((r) => r.error === 'cooldown-active');
  const durationMs = Date.now() - startTime;

  // ── Build metrics ──────────────────────────────────────────────────────
  const severityStats: Record<string, { triggered: number; errors: number }> = {};
  const categoryStats: Record<string, { triggered: number; total: number }> = {};

  for (const result of results) {
    const alarmDef = await prisma.alarmDefinition.findFirst({
      where: { code: result.alarmCode },
      select: { severity: true, category: true },
    });
    if (alarmDef) {
      if (!severityStats[alarmDef.severity])
        severityStats[alarmDef.severity] = { triggered: 0, errors: 0 };
      if (result.triggered) severityStats[alarmDef.severity].triggered++;
      if (result.error && result.error !== 'cooldown-active')
        severityStats[alarmDef.severity].errors++;

      if (!categoryStats[alarmDef.category])
        categoryStats[alarmDef.category] = { triggered: 0, total: 0 };
      categoryStats[alarmDef.category].total++;
      if (result.triggered) categoryStats[alarmDef.category].triggered++;
    }
  }

  const durationSec = Math.round(durationMs / 1000);
  const alarmsPerSec = parseFloat((results.length / (durationMs / 1000)).toFixed(1));
  log.info(
    { durationSec, triggered: triggered.length, errors: errors.length, cooldowns: cooldowns.length },
    'Evaluation complete'
  );
  if (errors.length > 0) {
    log.warn({ errors }, 'Alarm evaluation reported errors');
  }
  log.info({ alarmsPerSec }, 'Performance metric');

  // ── DLQ processing ─────────────────────────────────────────────────────
  try {
    const dlqStats = await getDLQStats();
    assertAlarmExecutionActive();
    if (dlqStats.pending > 0) {
      log.info({ pending: dlqStats.pending }, 'DLQ has pending notifications, processing');
      const dlqResult = await processDLQ();
      log.info(
        { succeeded: dlqResult.succeeded, failed: dlqResult.failed, permanentlyFailed: dlqResult.permanentlyFailed },
        'DLQ processing complete'
      );
    }
    assertAlarmExecutionActive();
    await cleanupDLQ();
  } catch (dlqErr) {
    log.error({ err: dlqErr }, 'DLQ error (non-fatal)');
  }

  // ── FA health alert ─────────────────────────────────────────
  // After every check, if FA has been failing, notify ops team once per hour.
  if (fortiAnalyzerConfigured) {
    assertAlarmExecutionActive();
    await maybeSendFAHealthAlert();
  }

  return {
    success: true,
    summary: {
      total: results.length,
      triggered: triggered.length,
      skippedCooldown: cooldowns.length,
      errors: errors.length,
    },
    metrics: {
      durationMs,
      alarmsPerSecond: alarmsPerSec,
      severityBreakdown: severityStats,
      categoryBreakdown: categoryStats,
    },
    triggered: triggered.map((r) => ({
      code: r.alarmCode,
      matchCount: r.matchCount,
      sampleEvents: r.events.slice(0, 2),
      ...(r.target ? { target: r.target } : {}),
    })),
    errors,
  };


}
