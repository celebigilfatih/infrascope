/**
 * Test script to check vCenter host API endpoint
 */

const https = require('https');

const VCENTER_HOST = '10.5.56.10';
const USERNAME = 'fatih@BUSKI.LOCAL';
const PASSWORD = 'Bu5K1+-2024';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
    console.log('OK\n');

    console.log('2. Fetching host list...');
    const hostsRes = await request('GET', '/vcenter/host', null, sessionId);
    const hosts = hostsRes.data;
    console.log(`OK - Found ${hosts.length} hosts\n`);

    if (hosts.length > 0) {
      const testHost = hosts[0];
      console.log('3. Testing host:', testHost.name, `(${testHost.host})`);

      // Try different approaches
      console.log('\n--- Approach 1: Direct endpoint ---');
      const endpoints = [
        `/vcenter/host/${testHost.host}`,
        `/vcenter/hosts/${testHost.host}`,
      ];

      for (const endpoint of endpoints) {
        console.log(`   Trying: ${endpoint}`);
        try {
          const detailsRes = await request('GET', endpoint, null, sessionId);
          console.log('   SUCCESS! Details:', JSON.stringify(detailsRes.data).substring(0, 300));
        } catch (err) {
          console.log('   Error:', err.message.substring(0, 50));
        }
      }

      // Approach 2: Filter by host
      console.log('\n--- Approach 2: Filter with host parameter ---');
      try {
        const filtered = await request('GET', '/vcenter/vm?hosts=' + testHost.host, null, sessionId);
        console.log('   VM filter result:', filtered.data?.length || 0, 'VMs');
      } catch (err) {
        console.log('   Error:', err.message.substring(0, 50));
      }

      // Approach 3: Try clusters endpoint
      console.log('\n--- Approach 3: Check cluster info ---');
      try {
        const clusters = await request('GET', '/vcenter/cluster', null, sessionId);
        console.log('   Clusters:', JSON.stringify(clusters.data).substring(0, 200));
      } catch (err) {
        console.log('   Error:', err.message.substring(0, 50));
      }
    }

    await request('DELETE', '/session', null, sessionId);
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
