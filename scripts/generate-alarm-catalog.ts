#!/usr/bin/env npx tsx
/**
 * Auto-generate docs/20-modules/alarms/DEFINITIONS.md from alarm-definitions.ts
 *
 * Usage:  npx tsx scripts/generate-alarm-catalog.ts
 *
 * Reads ALARM_DEFINITIONS from lib/alarms/alarm-definitions.ts and produces
 * a structured Markdown catalog grouped by category and sorted by severity.
 */

import { ALARM_DEFINITIONS } from '../lib/alarms/alarm-definitions';
import type { AlarmDefinitionSeed } from '../lib/alarms/alarm-definitions';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  ALARM_CRITICAL: 0,
  ALARM_HIGH: 1,
  ALARM_MEDIUM: 2,
  ALARM_LOW: 3,
  ALARM_INFO: 4,
};

const CATEGORY_LABELS: Record<string, string> = {
  CONFIG_ACCESS: 'Config & Access',
  SECURITY: 'Security',
  RISK_ANOMALY: 'Risk & Anomaly',
  OPERATIONAL: 'Operational',
  SOC_CORRELATION: 'SOC Correlation',
};

const SEVERITY_BADGES: Record<string, string> = {
  ALARM_CRITICAL: '🔴 CRITICAL',
  ALARM_HIGH: '🟠 HIGH',
  ALARM_MEDIUM: '🟡 MEDIUM',
  ALARM_LOW: '🔵 LOW',
  ALARM_INFO: '⚪ INFO',
};

const SOURCE_LABELS: Record<string, string> = {
  fortianalyzer: 'FortiAnalyzer',
  'fortigate-sslvpn': 'FortiGate SSL-VPN',
  vmware: 'VMware vCenter',
};

function severityBadge(s: string): string {
  return SEVERITY_BADGES[s] ?? s;
}

function sourceLabel(s?: string): string {
  if (!s) return 'FortiAnalyzer';
  return SOURCE_LABELS[s] ?? s;
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ─── Generate Markdown ────────────────────────────────────────────────────────

function generateCatalog(definitions: AlarmDefinitionSeed[]): string {
  const now = new Date().toISOString().split('T')[0];
  const total = definitions.length;

  // Group by category
  const grouped = new Map<string, AlarmDefinitionSeed[]>();
  for (const def of definitions) {
    const cat = def.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(def);
  }

  // Sort each group by severity then code
  for (const [, alarms] of grouped) {
    alarms.sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 99;
      const sb = SEVERITY_ORDER[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.code.localeCompare(b.code);
    });
  }

  const categoryOrder = ['CONFIG_ACCESS', 'SECURITY', 'RISK_ANOMALY', 'OPERATIONAL', 'SOC_CORRELATION'];

  const lines: string[] = [
    '# Alarm Definitions Catalog',
    '',
    `> **Auto-generated** from \`lib/alarms/alarm-definitions.ts\` on ${now}`,
    `> **Total:** ${total} alarm definitions`,
    `> **Regenerate:** \`npx tsx scripts/generate-alarm-catalog.ts\``,
    '',
    '---',
    '',
    '## Table of Contents',
    '',
  ];

  // TOC
  let tocIdx = 1;
  for (const cat of categoryOrder) {
    const alarms = grouped.get(cat);
    if (!alarms || alarms.length === 0) continue;
    const label = CATEGORY_LABELS[cat] ?? cat;
    const anchor = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`${tocIdx}. [${label}](#${anchor}) (${alarms.length} alarms)`);
    tocIdx++;
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Summary table
  lines.push('## Summary by Severity');
  lines.push('');

  const severityCounts = new Map<string, number>();
  for (const def of definitions) {
    severityCounts.set(def.severity, (severityCounts.get(def.severity) ?? 0) + 1);
  }

  lines.push('| Severity | Count |');
  lines.push('|---|---|');
  for (const sev of Object.keys(SEVERITY_ORDER)) {
    const count = severityCounts.get(sev) ?? 0;
    if (count > 0) {
      lines.push(`| ${severityBadge(sev)} | ${count} |`);
    }
  }
  lines.push(`| **Total** | **${total}** |`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Per-category sections
  for (const cat of categoryOrder) {
    const alarms = grouped.get(cat);
    if (!alarms || alarms.length === 0) continue;
    const label = CATEGORY_LABELS[cat] ?? cat;

    lines.push(`## ${label}`);
    lines.push('');

    // Category summary table
    lines.push('| Code | Name | Severity | Source | Cooldown | Email | Threshold | Window |');
    lines.push('|---|---|---|---|---|---|---|---|');

    for (const def of alarms) {
      const logic = def.detectionLogic;
      const src = sourceLabel(def.source ?? logic.source);
      const email = def.notifyEmail ? '✓' : '';
      const threshold = logic.threshold;
      const window = `${logic.timeWindowMinutes}m`;
      const cooldown = `${def.cooldownMinutes}m`;
      lines.push(
        `| \`${def.code}\` | ${escapeMd(def.name)} | ${severityBadge(def.severity)} | ${src} | ${cooldown} | ${email} | ${threshold} | ${window} |`
      );
    }

    lines.push('');

    // Detail subsections
    for (const def of alarms) {
      const logic = def.detectionLogic;
      lines.push(`### \`${def.code}\``);
      lines.push('');
      lines.push(`**${def.name}** — ${severityBadge(def.severity)}`);
      lines.push('');
      lines.push(`> ${def.description}`);
      lines.push('');
      lines.push('| Property | Value |');
      lines.push('|---|---|');
      lines.push(`| Category | ${CATEGORY_LABELS[def.category] ?? def.category} |`);
      lines.push(`| Source | ${sourceLabel(def.source ?? logic.source)} |`);
      lines.push(`| Cooldown | ${def.cooldownMinutes} minutes |`);
      lines.push(`| Threshold | ≥ ${logic.threshold} events |`);
      lines.push(`| Time Window | ${logic.timeWindowMinutes} minutes |`);
      if (def.notifyEmail) lines.push(`| Email Notify | ✓ |`);
      if (logic.logtype) lines.push(`| Log Type | \`${logic.logtype}\` |`);
      if (logic.filter) lines.push(`| Filter | \`${escapeMd(logic.filter)}\` |`);
      if (logic.clientCheck) lines.push(`| Client Check | \`${logic.clientCheck}\` |`);
      if (logic.fortiviewQuery) lines.push(`| FortiView | \`${logic.fortiviewQuery}\` |`);
      if (logic.correlationRules) {
        const cr = logic.correlationRules;
        lines.push(`| Correlation Precursors | ${cr.precursorCodes.map(c => `\`${c}\``).join(', ')} |`);
        lines.push(`| Correlation Lookback | ${cr.lookbackMinutes} minutes |`);
        lines.push(`| Correlation Match Field | \`${cr.matchField}\` |`);
        if (cr.minDistinctCodes) lines.push(`| Min Distinct Codes | ${cr.minDistinctCodes} |`);
      }
      lines.push('');
      lines.push(`**Recommended Action:** ${logic.recommendedAction}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`*This document was auto-generated on ${now}. Do not edit manually — regenerate with \`npx tsx scripts/generate-alarm-catalog.ts\`.*`);

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const markdown = generateCatalog(ALARM_DEFINITIONS);
const outPath = resolve(__dirname, '../docs/20-modules/alarms/DEFINITIONS.md');
writeFileSync(outPath, markdown, 'utf-8');

console.log(`✅ Generated ${outPath} (${ALARM_DEFINITIONS.length} alarm definitions)`);
