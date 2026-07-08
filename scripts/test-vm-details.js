/**
 * Test script to check vCenter API VM details endpoint
 */

const https = require('https');

const VCENTER_HOST = '10.5.56.10';
const USERNAME = 'fatih@BUSKI.LOCAL';
const PASSWORD = process.env.VCENTER_PASSWORD || '';

async function request(method, path, body = null, sessionId = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: VCENTER_HOST,
      port: 443,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      rejectUnauthorized: process.env.VMWARE_TLS_INSECURE !== 'true',
    };

    if (sessionId) {
      options.headers['vmware-api-session-id'] = sessionId;
    } else if (USERNAME && PASSWORD) {
      const auth = Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
      options.headers['Authorization'] = `Basic ${auth}`;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null, headers: res.headers });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  try {
    console.log('1. Authenticating...');
    const authRes = await request('POST', '/session');
    const sessionId = authRes.data;
    console.log('✅ Session ID:', sessionId.substring(0, 20) + '...\n');

    console.log('2. Fetching VM list...');
    const vmsRes = await request('GET', '/vcenter/vm', null, sessionId);
    const vms = vmsRes.data;
    console.log(`✅ Found ${vms.length} VMs\n`);

    if (vms.length > 0) {
      const testVM = vms[0];
      console.log('3. Testing VM details for:', testVM.name, `(${testVM.vm})`);
      console.log('   Basic info:', JSON.stringify(testVM, null, 2), '\n');

      console.log('4. Fetching detailed info...');
      const detailsRes = await request('GET', `/vcenter/vm/${testVM.vm}`, null, sessionId);
      const details = detailsRes.data;
      console.log('   Detailed info:', JSON.stringify(details, null, 2), '\n');

      console.log('5. Summary:');
      console.log('   VM Name:', testVM.name);
      console.log('   VM ID:', testVM.vm);
      console.log('   Host field:', details.host || 'N/A');
      console.log('   Guest OS:', details.guest_OS || 'N/A');
      console.log('   NICs keys:', details.nics ? Object.keys(details.nics) : []);
      if (details.nics) {
        const nics = Object.values(details.nics);
        console.log('   First NIC:', JSON.stringify(nics[0], null, 2));
      }
      
      // Try guest identity
      try {
        console.log('\n6. Fetching guest identity (IP address)...');
        const guestRes = await request('GET', `/vcenter/vm/${testVM.vm}/guest/identity`, null, sessionId);
        console.log('   Guest identity:', JSON.stringify(guestRes.data, null, 2));
      } catch (err) {
        console.log('   Guest identity not available:', err.message);
      }
    }

    console.log('\n6. Logging out...');
    await request('DELETE', '/session', null, sessionId);
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
