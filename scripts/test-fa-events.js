const https = require('https');

async function test() {
  // Login
  const loginRes = await fetch('https://10.5.0.247/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'exec',
      params: [{ url: '/sys/login/user', data: { user: 'fcelebigil', passwd: 'Thor.7485-a' } }],
      id: 1
    }),
  });
  const loginData = await loginRes.json();
  const sid = loginData.session;
  console.log('Session:', sid ? 'OK' : 'FAILED');

  // Search event logs - admin config changes
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

  const addRes = await fetch('https://10.5.0.247/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'add',
      params: [{
        url: '/logview/adom/root/logsearch',
        apiver: 3,
        device: [{ devid: 'All_FortiGate' }],
        logtype: 'event',
        filter: 'subtype == system',
        'time-order': 'desc',
        'time-range': {
          start: fmt(start),
          end: fmt(end),
        },
        limit: 200
      }],
      session: sid,
      id: 2
    }),
  });
  const addData = await addRes.json();
  console.log('Add result:', JSON.stringify(addData, null, 2));
  const tid = addData && addData.result && addData.result.tid;
  if (!tid) {
    console.log('No TID, exiting');
    return;
  }

  // Wait for results
  await new Promise(r => setTimeout(r, 8000));

  // Fetch results
  const getRes = await fetch('https://10.5.0.247/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'get',
      params: [{
        url: '/logview/adom/root/logsearch/' + tid,
        apiver: 3,
        offset: 0,
        limit: 20
      }],
      session: sid,
      id: 3
    }),
  });
  const getData = await getRes.json();
  
  if (getData && getData.result && getData.result.data) {
    console.log('Total lines:', getData.result.total_lines);
    console.log('Percentage:', getData.result.percentage);
    const logs = getData.result.data;
    logs.slice(0, 5).forEach((l, i) => {
      console.log(`\n--- Log ${i + 1} ---`);
      console.log(JSON.stringify(l, null, 2));
    });
  } else {
    console.log('Get result:', JSON.stringify(getData, null, 2));
  }
}

test().catch(console.error);
