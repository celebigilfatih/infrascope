/* eslint-disable @typescript-eslint/no-require-imports -- Actual service methods with synthetic transports and pure target data. */
const assert = require('node:assert/strict');
const { fixture } = require('./check-fortigate-snmp.cjs');
const f = fixture(), model = f.load('lib/firewall/virtual-ips.ts'), Service = f.load('lib/integrations/fortigate.ts').FortiGateService;
const query = { page: 1, limit: 10, search: '', filters: {} };
const vip = { name: 'web', extip: '192.0.2.10', mappedip: [{ range: '198.51.100.10' }], portforward: 'enable', extport: 443, mappedport: 8443, extintf: 'wan1', protocol: 'tcp', type: 'static-nat' };
async function main() {
  const service = new Service({ host: 'fixture.invalid', vdom: 'root', accessToken: 'synthetic', syncMode: 'rest', pollingInterval: 5, enabledModules: { vips: true, policies: true } });
  const calls = []; let brokenPolicy = false, brokenVip = false;
  service.apiRequest = async endpoint => { calls.push(endpoint); if (endpoint.endsWith('/vip')) return brokenVip ? {} : { results: [vip] }; if (brokenPolicy) throw Error('private-provider-message'); return { results: [{ policyid: 1, name: 'Allow web', dstaddr: [{ name: 'web' }], status: 'disable', action: 'accept' }] }; };
  let result = await model.readVipWorkspace(service, query);
  assert.equal(result.items[0].usage, 'referenced'); assert.equal(result.items[0].enabled, null); assert.equal(result.items[0].policies[0].enabled, false); assert.equal(result.summary.unknownState, 1); assert.equal(result.items[0].internalPort, '8443'); assert.equal(model.parseVipWorkspace(result).summary.referenced, 1); assert.deepEqual(calls, ['/cmdb/firewall/vip', '/cmdb/firewall/policy']);
  brokenPolicy = true; result = await model.readVipWorkspace(service, query); assert.equal(result.items[0].usage, 'unknown'); assert.equal(result.summary.referenced, null); assert.equal(result.items[0].policies.length, 0); assert.ok(!JSON.stringify(result).includes('private-provider')); model.parseVipWorkspace(result);
  brokenVip = true; await assert.rejects(model.readVipWorkspace(service, query), error => error.code === 'INVALID_RESPONSE');
  const disabled = new Service({ host: 'disabled.invalid', vdom: 'root', accessToken: 'synthetic', syncMode: 'rest', pollingInterval: 5, enabledModules: { vips: false, policies: false } });
  assert.equal((await disabled.fetchVIPs()).length, 0); await assert.rejects(disabled.fetchVIPs({ requireEnabled: true }), error => error.code === 'UNSUPPORTED_OPERATION'); await assert.rejects(disabled.fetchFirewallPolicies({ requireEnabled: true }), error => error.code === 'UNSUPPORTED_OPERATION');
  disabled.apiRequest = () => { throw Error('Disabled module must not call source'); };
  const rows = model.normalizeVirtualIps([vip, { ...vip, name: 'other', extip: '203.0.113.10', portforward: 'disable', status: 'enable' }], []);
  result = model.buildVipWorkspace(rows, { ...query, filters: { interface: 'wan1', status: 'enable' } }, null, '2026-10-17T12:00:00Z'); assert.equal(result.items.length, 1); assert.equal(result.summary.total, 2); assert.equal(result.summary.referenced, 0); model.parseVipWorkspace(result);
  assert.throws(() => model.normalizeVirtualIps([vip, vip], [])); assert.throws(() => model.normalizeVirtualIps([{}], []));
  assert.equal(model.normalizeVirtualIps([vip], [{ dstaddr: null }])[0].usage, 'unknown');
  const empty = model.buildVipWorkspace([], query, null, '2026-10-17T12:00:00Z'); assert.equal(empty.summary.total, 0); model.parseVipWorkspace(empty);
  assert.throws(() => model.parseVipWorkspace({ ...empty, summary: { ...empty.summary, total: -1 } }));
  console.log('Virtual IP contracts passed: actual optional strict service reads, disabled modules, malformed source, partial policy failure, target data, direct references, unknown vs zero, filters, counters and response validation. Synthetic source only.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
