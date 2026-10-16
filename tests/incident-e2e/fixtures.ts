import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

interface Manifest {
  prefix: string;
  reasons: { resolve: string; close: string };
  rows: Array<{ id: string; title: string; group: 'resolve' | 'close'; initialStatus: string }>;
}
export interface Fixtures { manifest: Manifest; userId: string; email: string; password: string; verify: (phase: string, group?: string) => void }
const cli = path.resolve('scripts/check-incident-browser-fixtures.cjs');

export const test = base.extend<{ fixtures: Fixtures; assignee: { id: string; name: string } }, { prisma: PrismaClient }>({
  prisma: [async ({}, use) => {
    const client = new PrismaClient();
    try { await use(client); } finally { await client.$disconnect(); }
  }, { scope: 'worker' }],
  assignee: async ({ prisma }, use) => {
    const suffix = randomUUID();
    const person = await prisma.user.create({ data: {
      name: `Incident E2E Assignee ${suffix.slice(0, 8)}`,
      email: `incident-assignee-${suffix}@example.invalid`, role: 'EDITOR', status: 'ACTIVE',
    } });
    try { await use(person); } finally { await prisma.user.delete({ where: { id: person.id } }); }
  },
  fixtures: async ({ prisma }, use, testInfo) => {
    const suffix = randomUUID();
    const email = `incident-e2e-${suffix}@example.invalid`;
    const password = `Fixture-${suffix}!9`;
    const directory = testInfo.outputPath('fixtures');
    const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], {
      env: { ...process.env, INFRASCOPE_INCIDENT_FIXTURE_DIR: directory }, encoding: 'utf8', timeout: 30_000,
    });
    // A separate canary makes accidental writes outside the selected fixtures detectable.
    const user = await prisma.user.create({ data: { name: 'Incident E2E Operator', email, password: await bcrypt.hash(password, 12), role: 'ADMIN', status: 'ACTIVE' } });
    let alarmId: string | undefined;
    try {
      const alarm = await prisma.alarmDefinition.create({ data: { code: `E2E-CANARY-${suffix}`, name: 'Unselected incident canary', enabled: false, notifyEmail: false, severity: 'ALARM_INFO', category: 'OPERATIONAL', source: 'fixture', detectionLogic: {},
        incidents: { create: { fingerprint: suffix, title: 'Unselected incident canary', message: 'Must never change', source: 'fixture', severity: 'ALARM_INFO', category: 'OPERATIONAL' } },
      } });
      alarmId = alarm.id;
      run('create');
      const manifest: Manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
      await use({ manifest, userId: user.id, email, password, verify: (phase, group) => { run('verify', phase, ...(group ? [group] : [])); } });
    } finally {
      // Playwright tears down fixtures even when an assertion fails.
      try { if (existsSync(path.join(directory, 'manifest.json'))) run('cleanup'); }
      finally {
        await prisma.auditLog.deleteMany({ where: { userId: user.id } });
        if (alarmId) {
          await prisma.alarmIncident.deleteMany({ where: { alarmId } });
          await prisma.alarmDefinition.delete({ where: { id: alarmId } });
        }
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
  },
});

export async function signIn(page: Page, fixtures: Fixtures) {
  await page.goto('/login');
  await page.getByPlaceholder('ornek@domain.com').fill(fixtures.email);
  await page.getByPlaceholder('Şifrenizi girin').fill(fixtures.password);
  const response = page.waitForResponse(reply => reply.url().endsWith('/api/auth/login') && reply.request().method() === 'POST');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}

export async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}
