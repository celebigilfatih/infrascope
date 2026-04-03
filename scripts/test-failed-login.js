const https = require('https');
const qs = require('querystring');

// Attempt 3 failed logins to FortiGate
async function failedLogin(i) {
  return new Promise((resolve) => {
    const d = qs.stringify({ username: `testfail${i}`, secretkey: 'wrongpass' });
    const r = https.request({
      hostname: '10.5.0.250', port: 443, path: '/logincheck', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(d) },
      rejectUnauthorized: false, timeout: 10000
    }, (resp) => {
      let s = ''; resp.on('data', c => s += c);
      resp.on('end', () => { console.log(`Attempt ${i}: HTTP ${resp.statusCode}`); resolve(); });
    });
    r.on('error', e => { console.log(`Attempt ${i}: Error - ${e.message}`); resolve(); });
    r.on('timeout', () => { r.destroy(); console.log(`Attempt ${i}: Timeout`); resolve(); });
    r.write(d); r.end();
  });
}

(async () => {
  for (let i = 1; i <= 3; i++) {
    await failedLogin(i);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('Done - 3 failed login attempts sent');
})();
