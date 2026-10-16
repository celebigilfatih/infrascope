// Synthetic atomic lease store for runner tests; PostgreSQL behavior has a separate suite.
function matches(row, where = {}) {
  if (where.OR && !where.OR.some(item => matches(row, item))) return false;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return true;
    if (value && typeof value === 'object') return Object.entries(value).every(([op, bound]) =>
      op === 'gte' ? row[key] >= bound : op === 'lte' ? row[key] <= bound : op === 'lt' ? row[key] < bound : op === 'gt' ? row[key] > bound : false);
    return row[key] === value;
  });
}
function attachAlarmLease(prisma, state, clock = Date) {
  let queue = Promise.resolve();
  const originalRaw = prisma.$queryRaw?.bind(prisma);
  const originalConfig = prisma.systemConfig || {};
  prisma.systemConfig = {
    ...originalConfig,
    findUnique: async args => args.where.key === 'alarm-runner-lease-v1' ? state().lease || null : originalConfig.findUnique?.(args) ?? null,
    upsert: async ({ create, update }) => state().lease = state().lease ? { ...state().lease, ...update } : { ...create },
    updateMany: async ({ where, data }) => {
      if (!state().lease || state().lease.key !== where.key) return { count: 0 };
      Object.assign(state().lease, data); return { count: 1 };
    },
  };
  prisma.alarmCheckLog.updateMany = async ({ where, data }) => {
    const rows = state().logs.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length };
  };
  const originalFind = prisma.alarmCheckLog.findFirst;
  prisma.alarmCheckLog.findFirst = async args => state().logs.filter(row => matches(row, args.where)).sort((a, b) => b.checkTime - a.checkTime)[0] || null;
  prisma.$queryRaw = async (...args) => {
    const sql = args[0].sql || String(args[0]);
    if (sql.includes('clock_timestamp')) return [{ now: new clock() }];
    if (sql.includes('pg_advisory_xact_lock')) return [{ locked: 1 }];
    return originalRaw ? originalRaw(...args) : [];
  };
  prisma.$transaction = async work => {
    const previous = queue;
    let release; queue = new Promise(resolve => { release = resolve; });
    await previous;
    const saved = { logs: structuredClone(state().logs), lease: structuredClone(state().lease) };
    try { if (state().claimError) throw new Error('Fixture claim unavailable'); return await work(prisma); }
    catch (error) { state().logs = saved.logs; state().lease = saved.lease; throw error; }
    finally { release(); }
  };
  return { originalFind };
}
module.exports = { attachAlarmLease, matches };
