import https from 'https';

const FA_HOST = '10.5.0.247', FA_USER = 'infrascope', FA_PASS = 'Thor.7485-infra';

function post(body) {
  return new Promise((res, rej) => {
    const d = JSON.stringify(body);
    const r = https.request({
      hostname: FA_HOST, port: 443, path: '/jsonrpc', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) },
      rejectUnauthorized: false
    }, (resp) => {
      let s = ''; resp.on('data', c => s += c); resp.on('end', () => res(JSON.parse(s)));
    });
    r.on('error', rej); r.write(d); r.end();
  });
}

async function main() {
  const login = await post({ id: 1, method: 'exec', params: [{ url: '/sys/login/user', data: { user: FA_USER, passwd: FA_PASS } }] });
  const token = login?.session;
  console.log('Session:', token ? 'OK' : JSON.stringify(login).slice(0, 200));
  if (!token) return;

  const timeRange = { start: '2026-04-01 00:00:00', end: '2026-04-02 23:59:59', timezone: 0 };
  const device = [{ devid: 'All_FortiGate' }];

  // Test 1: failed login filter
  const f1 = await post({ id: 2, session: token, method: 'add', params: [{ url: '/logview/adom/root/logsearch', apiver: 'v6', data: { time: timeRange, device, logtype: 'event', filter: 'subtype==system and action==login and status==failed', limit: 5 } }] });
  console.log('T1 (status==failed):', JSON.stringify(f1?.result?.[0]).slice(0, 200));

  // Test 2: any login (no status filter)
  const f2 = await post({ id: 3, session: token, method: 'add', params: [{ url: '/logview/adom/root/logsearch', apiver: 'v6', data: { time: timeRange, device, logtype: 'event', filter: 'subtype==system and action==login', limit: 5 } }] });
  console.log('T2 (any login):', JSON.stringify(f2?.result?.[0]).slice(0, 200));
  const tid2 = f2?.result?.[0]?.data?.tid;

  // Test 3: poll T2 results if TID exists
  if (tid2) {
    await new Promise(r => setTimeout(r, 4000));
    const r2 = await post({ id: 4, session: token, method: 'get', params: [{ url: `/logview/adom/root/logsearch/${tid2}`, apiver: 'v6', data: { offset: 0, limit: 5 } }] });
    const logs = r2?.result?.[0]?.data?.logs || r2?.result?.[0]?.data;
    console.log('T2 logs:', JSON.stringify(logs).slice(0, 500));
  }

  // Test 4: different filter syntax
  const f4 = await post({ id: 5, session: token, method: 'add', params: [{ url: '/logview/adom/root/logsearch', apiver: 'v6', data: { time: timeRange, device, logtype: 'event', filter: 'subtype == system and action == login and status == failed', limit: 5 } }] });
  console.log('T4 (space syntax):', JSON.stringify(f4?.result?.[0]).slice(0, 200));

  await post({ id: 99, session: token, method: 'exec', params: [{ url: '/sys/logout' }] });
}

main().catch(console.error);
