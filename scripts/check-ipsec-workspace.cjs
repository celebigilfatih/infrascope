/* eslint-disable @typescript-eslint/no-require-imports -- Real model, shared source, target factory and route; isolated I/O. */
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { fixture } = require('./check-fortigate-snmp.cjs');
const f = fixture(), model = f.load('lib/security/ipsec.ts'), route = f.load('app/api/integrations/fortigate/ipsec/workspace/route.ts');
const scope = { configId: 'config-a', vdom: 'root', host: 'a.invalid' };
const request = extra => new NextRequest('http://localhost/api/integrations/fortigate/ipsec/workspace?' + new URLSearchParams({ configId: scope.configId, vdom: scope.vdom, expectedHost: scope.host, ...extra }));
const raw = [
 { name: 'TEST-HQ', rgwy: '198.51.100.10', proxyid: [{ p2name: 'TEST-LAN', status: 'up' }, { p2name: 'TEST-APP', status: 'down' }], incoming_bytes: 0, outgoing_bytes: '9007199254740993', connection_count: 0, tun_id: '10.0.0.1', psksecret: 'PRIVATE_MONITOR_SECRET' },
 { name: 'TEST-Dialup_1', parent: 'TEST-Dialup', rgwy: '2001:db8::10', proxyid: [{ status: 'up' }, { status: 'up' }], incoming_bytes: 1024, outgoing_bytes: 1536, connection_count: 1, username: 'TEST peer identity' },
 { name: 'TEST-Unknown', proxyid: [{ status: 'up' }, {}], incoming_bytes: Number.MAX_SAFE_INTEGER + 1 },
 { name: 'TEST-Down', proxyid: [{ status: 'down' }] },
];
const config = [{ name: 'TEST-HQ', interface: 'wan1', 'local-gw': '192.0.2.1', 'ike-version': 2, type: 'static', psksecret: 'PRIVATE_CONFIG_SECRET', password: 'PRIVATE_PASSWORD' }, { name: 'TEST-Dialup', interface: 'wan2', 'local-gw': '0.0.0.0', 'local-gw6': '::', 'ike-version': '2' }];
const metadata = { monitorAt: new Date(f.state.now).toISOString(), configAt: new Date(f.state.now).toISOString(), configErrorCode: null };
async function main() {
 let snapshot = model.buildIpsecSnapshot(raw, config, metadata);
 assert.equal(snapshot.rows[0].state, 'partial'); assert.equal(snapshot.rows[1].state, 'up'); assert.equal(snapshot.rows[2].state, 'unknown'); assert.equal(snapshot.rows[3].state, 'down'); assert.equal(snapshot.rows[0].incoming, '0'); assert.equal(snapshot.rows[0].outgoing, '9007199254740993'); assert.equal(snapshot.rows[0].connections, '0'); assert.equal(snapshot.rows[2].incoming, null); assert.equal(snapshot.rows[0].local.gateways[0], '192.0.2.1'); assert.equal(snapshot.rows[0].local.ikeVersion, '2'); assert.equal(snapshot.rows[1].local.configName, 'TEST-Dialup'); assert.equal(snapshot.rows[1].local.gateways.length, 0); assert.equal(snapshot.rows[2].local, null); assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
 for (const value of [undefined, null, {}, [null], [{}], [raw[0], raw[0]]]) assert.throws(() => model.buildIpsecSnapshot(value, config, metadata));
 assert.equal(model.buildIpsecSnapshot([{ name: 'TEST-No-Phase', proxyid: [] }], [], metadata).rows[0].state, 'unknown'); assert.equal(model.buildIpsecSnapshot([{ name: 'TEST-No-Phase' }], [], metadata).rows[0].state, 'unknown');
 assert.equal(model.buildIpsecSnapshot([{ name: 'Same', rgwy: '192.0.2.1' }, { name: 'Same', rgwy: '192.0.2.2' }], [], metadata).rows.length, 2);
 for (const zero of ['::', '0::0', '0000:0000:0000:0000:0000:0000:0000:0000']) {
  const zeroSnapshot = model.buildIpsecSnapshot([{ name: 'TEST-Zero', rgwy: zero }], [{ name: 'TEST-Zero', 'local-gw6': zero }], metadata);
  assert.equal(zeroSnapshot.rows[0].remoteGateway, null); assert.equal(zeroSnapshot.rows[0].local.gateways.length, 0);
 }
 for (const invalid of [null, {}, [{ name: 'x' }, { name: 'x' }]]) { const partial = model.buildIpsecSnapshot(raw, invalid, metadata); assert.equal(partial.rows.length, 4); assert.equal(partial.configAt, null); assert.equal(partial.configErrorCode, 'INVALID_RESPONSE'); assert.ok(partial.rows.every(row => row.local === null)); }
 for (const v of [undefined, null, '', '01', '-1', '1e9', 1.5, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(model.ipsecCounter(v), null);
 assert.equal(model.ipsecBytes('0'), '0 B'); assert.equal(model.ipsecBytes(null), 'Bilgi yok'); assert.equal(model.ipsecBytes('1023'), '1.023 B'); assert.equal(model.ipsecBytes('1024'), '1 KiB'); assert.equal(model.ipsecBytes('1536'), '1,5 KiB'); assert.equal(model.ipsecCountLabel('9007199254740993'), '9.007.199.254.740.993');
 let envelope = { success: true, source: 'fortigate-rest', target: scope, data: snapshot }; assert.equal(model.parseIpsecSnapshot(envelope, scope).rows.length, 4);
 for (const key of Object.keys(scope)) assert.throws(() => model.parseIpsecSnapshot({ ...envelope, target: { ...scope, [key]: 'WRONG' } }, scope));
 for (const change of [{ monitorAt: new Date(f.state.now + 60000).toISOString() }, { rows: [{ ...snapshot.rows[0], state: 'up' }] }, { rows: [snapshot.rows[0], snapshot.rows[0]] }, { configErrorCode: 'UNKNOWN' }, { rows: [{ ...snapshot.rows[0], incoming: -1 }] }, { rows: [{ ...snapshot.rows[0], local: { ...snapshot.rows[0].local, gateways: ['0.0.0.0'] } }] }]) assert.throws(() => model.parseIpsecSnapshot({ ...envelope, data: { ...snapshot, ...change } }, scope));
 for (const extra of [{ configId: '' }, { vdom: '' }, { expectedHost: '' }]) assert.equal((await route.GET(request(extra))).status, 400);
 f.state.allowed = false; assert.equal((await route.GET(request())).status, 403); assert.equal(f.state.transport.length, 0); f.state.allowed = true;
 assert.equal((await route.GET(request())).status, 501); assert.equal(f.state.transport.length, 0);
 f.state.configs[0].config.syncMode = 'rest';
 let response = await route.GET(request()), body = await response.json(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(model.parseIpsecSnapshot(body, scope).rows.length, 0); assert.equal(f.state.transport.length, 2); assert.ok(f.state.transport.every(call => call.url.endsWith('vdom=root')));
 const service = (await f.connector('config-a')).service, calls = []; let monitorFail = false, configFail = false, malformedMonitor = false;
 service.apiRequest = async endpoint => { calls.push(endpoint); if (endpoint === '/monitor/vpn/ipsec') { if (monitorFail) throw Error('PRIVATE_SOURCE_FAILURE'); return malformedMonitor ? {} : { results: raw }; } if (configFail) throw Error('PRIVATE_CONFIG_FAILURE'); return { results: config }; };
 response = await route.GET(request()); body = await response.json(); assert.equal(response.status, 200); assert.equal(model.parseIpsecSnapshot(body, scope).rows[0].state, 'partial'); assert.ok(!JSON.stringify(body).includes('PRIVATE')); assert.ok(calls.includes('/monitor/vpn/ipsec')); assert.ok(calls.includes('/cmdb/vpn.ipsec/phase1-interface'));
 configFail = true; response = await route.GET(request()); body = await response.json(); assert.equal(response.status, 200); assert.equal(body.data.rows.length, 4); assert.ok(body.data.configErrorCode); assert.equal(body.data.configAt, null); model.parseIpsecSnapshot(body, scope); assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 monitorFail = true; response = await route.GET(request()); body = await response.json(); assert.equal(body.success, false); assert.equal(body.data, undefined); assert.ok(!JSON.stringify(body).includes('PRIVATE')); monitorFail = false; configFail = false;
 malformedMonitor = true; assert.equal((await route.GET(request())).status, 502); malformedMonitor = false;
 const before = calls.length; assert.equal((await route.GET(request({ expectedHost: 'wrong.invalid' }))).status, 409); assert.equal(calls.length, before);
 f.state.configs[0].enabled = false; assert.equal((await route.GET(request())).status, 409); assert.equal(calls.length, before); f.state.configs[0].enabled = true;
 assert.equal((await route.GET(request({ configId: 'missing' }))).status, 404);
 response = await route.GET(request({ vdom: 'TEST-B' })); body = await response.json(); assert.equal(response.status, 200); assert.equal(body.target.vdom, 'TEST-B'); assert.ok(f.state.transport.slice(-2).every(call => call.url.endsWith('vdom=TEST-B')));
 const Service = f.load('lib/integrations/fortigate.ts').FortiGateService;
 const cookieService = new Service({ host: 'cookie.test.invalid', accessToken: '', username: 'TEST', password: 'TEST', syncMode: 'rest', vdom: 'root' });
 let logins = 0; cookieService.login = async () => { logins++; await Promise.resolve(); cookieService.sessionCookie = 'TEST-COOKIE'; cookieService.sessionExpiry = f.state.now + 60000; };
 const beforeCookie = f.state.transport.length;
 const simultaneous = await Promise.all([cookieService.getIPsecWorkspace(), cookieService.getIPsecWorkspace()]);
 assert.equal(logins, 1, 'Concurrent workspace reads share one established cookie session'); assert.equal(simultaneous[0], simultaneous[1]); assert.equal(f.state.transport.length - beforeCookie, 2);
 await cookieService.getIPsecWorkspace(); assert.equal(f.state.transport.length - beforeCookie, 4, 'A completed read is not a response cache');
 const originalRequest = cookieService.apiRequest;
 cookieService.apiRequest = async () => { throw Error('PRIVATE_SOURCE_FAILURE'); };
 const failures = await Promise.allSettled([cookieService.getIPsecWorkspace(), cookieService.getIPsecWorkspace()]); assert.ok(failures.every(result => result.status === 'rejected'));
 cookieService.apiRequest = originalRequest; await cookieService.getIPsecWorkspace(); assert.equal(f.state.transport.length - beforeCookie, 6, 'Failed reads release the in-flight slot');
 const snmpCookie = new Service({ host: 'snmp.test.invalid', accessToken: '', username: 'TEST', password: 'TEST', syncMode: 'snmp' });
 snmpCookie.login = async () => { throw Error('SNMP workspace must not start cookie authentication'); };
 await assert.rejects(snmpCookie.getIPsecWorkspace(), error => error.code === 'UNSUPPORTED_OPERATION');
 assert.equal(f.state.writes.length, 0); assert.equal(f.state.inventory.length, 0); assert.equal(f.state.configUpdates.length, 0);
 console.log('IPsec checks passed: all child states and partial/unknown distinctions, configured local vs observed remote endpoints, exact counters and byte units, source/config partial failure, parent identity, credential allowlist, actual shared reader/factory/scoped authorized route, disabled/SNMP/host guards and no persistence or writes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
