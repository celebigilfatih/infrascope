// Execute the real incident service and notification decision with an in-memory DB.
// No application environment, database, integration or SMTP connection is loaded.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS fixture runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');

const root = path.resolve(__dirname, '..');
const quiet = new Proxy({}, { get: () => () => {} });
let state;
function reset() {
  state = { events: [], incidents: [], audits: [], mail: [], whitelist: [], failCreate: false, uniqueConflict: false, delivered: true };
}
function eventWithIncident(event) {
  return event ? { ...event, incident: state.incidents.find(row => row.id === event.incidentId) || null } : null;
}
function update(row, data) {
  assert.ok(row, 'The fixture row must exist');
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || key === 'transitions') continue;
    row[key] = value && typeof value === 'object' && 'increment' in value
      ? (row[key] || 0) + value.increment : value;
  }
  return { ...row };
}
const prisma = {
  alarmEvent: {
    findUnique: async ({ where }) => {
      const key = where.alarmId_sourceEventId;
      return eventWithIncident(state.events.find(row => row.alarmId === key.alarmId && row.sourceEventId === key.sourceEventId));
    },
    create: async ({ data }) => {
      if (state.failCreate) throw new Error('Fixture event write failed');
      assert.ok(!state.events.some(row => row.alarmId === data.alarmId && row.sourceEventId === data.sourceEventId), 'Unique source occurrence');
      const row = { id: `event-${state.events.length + 1}`, createdAt: new Date('2026-10-15T12:00:00Z'), ...data };
      state.events.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => update(state.events.find(row => row.id === where.id), data),
    updateMany: async ({ where, data }) => {
      const rows = state.events.filter(row => row.incidentId === where.incidentId);
      rows.forEach(row => update(row, data));
      return { count: rows.length };
    },
  },
  alarmIncident: {
    findUnique: async ({ where }) => state.incidents.find(row => row.activeFingerprint === where.activeFingerprint) || null,
    findUniqueOrThrow: async ({ where }) => {
      const row = state.incidents.find(row => row.id === where.id);
      assert.ok(row);
      return { ...row };
    },
    create: async ({ data }) => {
      const row = { id: `incident-${state.incidents.length + 1}`, reopenCount: 0, ...data };
      state.incidents.push(row);
      return { ...row };
    },
    update: async ({ where, data }) => update(state.incidents.find(row => row.id === where.id), data),
  },
  auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  alarmWhitelist: { findMany: async () => state.whitelist },
  $queryRaw: async query => {
    assert.match(query.sql, /FOR UPDATE$/);
    return state.incidents.filter(row => row.id === query.values[0]).map(row => ({ id: row.id }));
  },
  $transaction: async callback => {
    if (state.uniqueConflict) {
      state.uniqueConflict = false;
      throw new Prisma.PrismaClientKnownRequestError('Fixture concurrent occurrence', { code: 'P2002', clientVersion: 'fixture' });
    }
    const snapshot = structuredClone(state);
    try { return await callback(prisma); }
    catch (error) { state = snapshot; throw error; }
  },
};
const overrides = {
  '@/lib/prisma': { prisma },
  '@/lib/logger': { createLogger: () => quiet },
  '@/lib/integrations/fortianalyzer': {},
  '@/lib/integrations/vmware': {},
  '@/lib/integrations/fortigate': {},
  '@/lib/firewall/connector-factory': {},
  '@/lib/alarms/queries': { ALARM_QUERY_REGISTRY: new Map(), BYPASS_CACHE_ALARMS: new Set() },
  '@/lib/alarms/suppression-engine': { createDefaultSuppressionEngine: () => ({}) },
  '@/lib/notifications/email': {
    sendAlarmEmail: async data => { state.mail.push(data); return state.delivered; },
    getEmailStats: () => ({}),
  },
};
function moduleLoader(dependencies, globals = {}) {
  const modules = new Map();
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const fixtureModule = { exports: {} };
    modules.set(filename, fixtureModule);
    if (filename.endsWith('.json')) {
      fixtureModule.exports = JSON.parse(fs.readFileSync(filename, 'utf8'));
      return fixtureModule.exports;
    }
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const localRequire = name => {
      const alias = name.startsWith('.')
        ? '@/' + path.relative(root, path.resolve(path.dirname(filename), name)).split(path.sep).join('/') : name;
      if (dependencies[alias]) return dependencies[alias];
      const extension = name.endsWith('.json') ? '' : '.ts';
      if (name.startsWith('@/')) return load(name.slice(2) + extension);
      if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), name)) + extension);
      if (['crypto', 'node:crypto', 'node:async_hooks', '@prisma/client'].includes(name)) return require(name);
      throw new Error(`Unapproved fixture dependency: ${name}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {
      console, Date, Buffer, Map, Set, URL, structuredClone, TextEncoder, TextDecoder,
      // Synthetic key only. Never load installation ENV into isolated fixtures.
      process: { env: { INTEGRATION_CREDENTIALS_KEY: Buffer.alloc(32, 13).toString('base64') } },
      fetch: () => { throw new Error('Network access is forbidden in occurrence checks'); },
      setTimeout: () => { throw new Error('Background jobs are forbidden in occurrence checks'); },
      ...globals,
    }, { filename })(localRequire, fixtureModule, fixtureModule.exports);
    return fixtureModule.exports;
  }
  return load;
}

const load = moduleLoader(overrides);
const service = load('lib/alarms/incident-service.ts');
const { AlarmDetectionEngine } = load('lib/alarms/detection-engine.ts');
const alarm = {
  id: 'fixture-rule', code: 'ADMIN_CONFIG_CHANGE', name: 'Yapılandırma değişikliği', description: null,
  category: 'CONFIG_ACCESS', severity: 'ALARM_HIGH', enabled: true, cooldownMinutes: 15,
  notifyEmail: true, source: 'fortianalyzer',
  detectionLogic: { source: 'fortianalyzer', logtype: 'event', threshold: 1, timeWindowMinutes: 5, description: 'Fixture' },
};
const baseLog = {
  logid: '0100000001', eventtime: '1792065600000000000', itime_t: 1792065600,
  devid: 'FIXTURE-A', devname: 'fixture-a', vd: 'root', type: 'event', subtype: 'system',
  user: 'fixture-admin', action: 'Edit', cfgpath: 'system.global', msg: 'Fixture configuration changed',
};
const log = changes => ({ ...baseLog, ...changes });
const input = (entry, changes = {}) => ({ alarm, title: 'Fixture', message: 'Fixture', rawData: [entry], deviceName: entry.devname, sourceScope: 'fixture-analyzer-a', ...changes });
const identity = (entry, changes) => service.buildOccurrenceIdentity(input(entry, changes));
function engine(scope = 'fixture-analyzer-a') {
  return new AlarmDetectionEngine(null, { fortiAnalyzerConfigId: scope });
}
async function fire(entry, options = {}) {
  await engine(options.scope).fireAlarm({ ...alarm, notifyEmail: options.notifyEmail ?? true }, [entry]);
}
async function close(incidentId) {
  const actor = { type: 'SYSTEM', name: 'fixture-operator' };
  await service.transitionAlarmIncident({ incidentId, action: 'RESOLVE', actor });
  await service.transitionAlarmIncident({ incidentId, action: 'CLOSE', actor });
}
async function seedLegacy(entry = log()) {
  const original = await service.recordAlarmOccurrence(input(entry, { sourceEventId: entry.logId || entry.logid }));
  await close(original.incident.id);
  return original;
}

const tests = [
  ['a repeated source event creates one occurrence and one notification', async () => {
    await fire(log()); await fire(log());
    assert.equal(state.events.length, 1); assert.equal(state.mail.length, 1);
    assert.equal(state.incidents[0].occurrenceCount, 1);
    assert.equal(state.mail[0].alarmEventId, state.events[0].id);
    assert.equal(state.mail[0].incidentId, state.incidents[0].id);
    assert.equal(state.events[0].notifyChannel, 'email');
  }],
  ['two events of the same type at different source times are retained', async () => {
    await fire(log()); await fire(log({ eventtime: '1792065601000000000', itime_t: 1792065601 }));
    assert.equal(state.events.length, 2); assert.equal(state.mail.length, 2);
    assert.equal(state.incidents[0].occurrenceCount, 2);
  }],
  ['nanosecond identity is not rounded to a JavaScript Date', async () => {
    assert.notEqual(identity(log()).sourceEventId, identity(log({ eventtime: '1792065600000000001' })).sourceEventId);
  }],
  ['device, VDOM and analyzer scope independently distinguish events', async () => {
    const original = identity(log()).sourceEventId;
    for (const entry of [log({ devid: 'FIXTURE-B' }), log({ vd: 'branch' })]) {
      assert.notEqual(identity(entry).sourceEventId, original);
    }
    assert.notEqual(identity(log(), { sourceScope: 'fixture-analyzer-b' }).sourceEventId, original);
    await fire(log()); await fire(log(), { scope: 'fixture-analyzer-b' });
    assert.equal(state.events.length, 2); assert.equal(state.mail.length, 2);
  }],
  ['device case, VDOM aliases and enrichment do not replay a source event', async () => {
    const original = identity(log()).sourceEventId;
    assert.equal(identity(log({ devid: 'fixture-a', vd: undefined, vdom: 'ROOT', extraDisplayField: 'fixture' })).sourceEventId, original);
    assert.equal(identity({ rawLog: log(), timestamp: 1792065600 }).sourceEventId, original);
  }],
  ['different physical devices and VDOMs retain their own occurrences', async () => {
    await fire(log()); await fire(log({ devid: 'FIXTURE-B', devname: 'fixture-b' })); await fire(log({ vd: 'branch' }));
    assert.equal(state.events.length, 3); assert.equal(state.mail.length, 3);
    assert.equal(new Set(state.events.map(event => event.sourceEventId)).size, 3);
  }],
  ['coarse timestamps retain different evidence without using collector enrichment', async () => {
    const entry = log({ eventtime: undefined });
    assert.notEqual(identity(entry).sourceEventId, identity({ ...entry, msg: 'A different fixture event' }).sourceEventId);
    assert.equal(identity(entry).sourceEventId, identity({ ...entry, extraDisplayField: 'fixture' }).sourceEventId);
  }],
  ['different native events sharing a device clock tick are retained', async () => {
    await fire(log()); await fire(log({ msg: 'A second fixture change in the same clock tick' }));
    await fire(log({ cfgattr: 'hostname[fixture-before->fixture-after]' }));
    assert.equal(state.events.length, 3); assert.equal(state.mail.length, 3);
  }],
  ['missing source time uses deterministic first-event evidence', async () => {
    const entry = log({ eventtime: undefined, itime_t: undefined });
    const reordered = Object.fromEntries(Object.entries(entry).reverse());
    assert.equal(identity(entry).sourceEventId, identity(reordered).sourceEventId);
    assert.notEqual(identity(entry).sourceEventId, identity({ ...entry, msg: 'A different fixture event' }).sourceEventId);
    const first = service.buildOccurrenceIdentity(input(entry));
    const batch = service.buildOccurrenceIdentity({ ...input(entry), rawData: [entry, log({ devid: 'FIXTURE-B' })] });
    assert.equal(first.sourceEventId, batch.sourceEventId);
  }],
  ['a new event after CLOSED creates a new incident and notification', async () => {
    await fire(log()); await close(state.incidents[0].id); await fire(log());
    assert.equal(state.events.length, 1); assert.equal(state.mail.length, 1);
    await fire(log({ eventtime: '1792065601000000000', itime_t: 1792065601 }));
    assert.equal(state.events.length, 2); assert.equal(state.mail.length, 2);
    assert.equal(state.incidents.length, 2); assert.equal(state.incidents[0].status, 'CLOSED');
    assert.equal(state.incidents[1].status, 'OPEN');
  }],
  ['a new source occurrence reopens a RESOLVED incident', async () => {
    await fire(log());
    await service.transitionAlarmIncident({ incidentId: state.incidents[0].id, action: 'RESOLVE', actor: { type: 'SYSTEM', name: 'fixture' } });
    await fire(log({ eventtime: '1792065601000000000', itime_t: 1792065601 }));
    assert.equal(state.incidents.length, 1); assert.equal(state.incidents[0].reopenCount, 1);
    assert.equal(state.incidents[0].status, 'OPEN'); assert.equal(state.events.length, 2);
  }],
  ['a proven legacy replay is suppressed without rewriting history', async () => {
    await seedLegacy();
    const before = JSON.stringify({ events: state.events, incidents: state.incidents });
    await fire(log());
    assert.equal(state.mail.length, 0);
    assert.equal(JSON.stringify({ events: state.events, incidents: state.incidents }), before);
  }],
  ['a legacy event-type ID does not suppress a new time or device', async () => {
    await seedLegacy();
    await fire(log({ eventtime: '1792065601000000000', itime_t: 1792065601 }));
    await fire(log({ devid: 'FIXTURE-B', devname: 'fixture-b' }));
    assert.equal(state.events.length, 3); assert.equal(state.mail.length, 2);
  }],
  ['missing legacy evidence cannot permanently suppress a new event', async () => {
    await seedLegacy(); state.events[0].rawData = { archived: true };
    await fire(log()); assert.equal(state.events.length, 2); assert.equal(state.mail.length, 1);
  }],
  ['legacy matching cannot invent a timestamp or device identity', async () => {
    await seedLegacy(log({ devid: undefined }));
    await fire(log({ devid: undefined }));
    assert.equal(state.events.length, 2); assert.equal(state.mail.length, 1);
  }],
  ['explicit NMS source IDs and generic VMware event IDs stay compatible', async () => {
    const explicit = service.buildOccurrenceIdentity({ ...input(log()), alarm: { ...alarm, code: 'NMS_PORT_DOWN', source: 'nms' }, sourceEventId: 'port:fixture:outage' });
    assert.equal(explicit.sourceEventId, 'NMS_PORT_DOWN:port:fixture:outage');
    const generic = service.buildOccurrenceIdentity({ ...input({ eventId: 'fixture-event' }), alarm: { ...alarm, source: 'vmware' } });
    assert.equal(generic.sourceEventId, 'ADMIN_CONFIG_CHANGE:fixture-event');
  }],
  ['notification opt-out, whitelist and failed writes prevent sending', async () => {
    await fire(log(), { notifyEmail: false });
    assert.equal(state.events.length, 1); assert.equal(state.mail.length, 0);
    reset(); state.failCreate = true;
    await assert.rejects(fire(log()), /Fixture event write failed/);
    assert.equal(state.events.length, 0); assert.equal(state.incidents.length, 0); assert.equal(state.mail.length, 0);
    reset(); state.whitelist = [{ field: 'user', value: 'fixture-admin', matchType: 'exact' }];
    await fire(log()); assert.equal(state.events.length, 0); assert.equal(state.mail.length, 0);
  }],
  ['a unique conflict recovers the existing occurrence without a second notification', async () => {
    await fire(log()); state.uniqueConflict = true; await fire(log());
    assert.equal(state.events.length, 1); assert.equal(state.mail.length, 1);
  }],
  ['an unsuccessful delivery keeps the occurrence without claiming it was notified', async () => {
    state.delivered = false; await fire(log());
    assert.equal(state.events.length, 1); assert.equal(state.mail.length, 1);
    assert.equal(state.events[0].notifiedAt, undefined); assert.equal(state.events[0].notifyChannel, undefined);
  }],
];

async function main() {
  for (const [name, test] of tests) {
    reset(); await test(); console.log(`PASS ${name}`);
  }
  console.log(`Alarm occurrence regressions passed (${tests.length} scenarios; isolated DB and email fixtures).`);
}

module.exports = { moduleLoader, alarm, log, input };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
