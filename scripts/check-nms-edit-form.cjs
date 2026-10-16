const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../lib/nms/edit-device-form.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
vm.runInThisContext(`(function(module,exports){${compiled}\n})`, { filename })(loaded, loaded.exports);
const { createEditForm, validateEditForm, buildEditPayload, getEditChanges } = loaded.exports;
const device = {
  managementIp: '192.0.2.10', snmpVersion: '2c', snmpPort: 161,
  pollingEnabled: true, pollingInterval: 300, sshUsername: 'fixture', sshPort: 22,
  hasSnmpCommunity: true, hasSnmpV3AuthPassword: false,
  hasSnmpV3PrivacyPassword: false, hasSshPassword: true,
};
let checks = 0;
function check(name, run) { run(); checks++; console.log(`PASS ${name}`); }

check('Untouched settings preserve stored secrets and contain no changes', () => {
  const form = createEditForm(device);
  assert.deepEqual(validateEditForm(form, device), {});
  assert.deepEqual(getEditChanges(form, device), []);
  const payload = buildEditPayload(form);
  for (const key of ['snmpCommunity', 'snmpV3AuthPassword', 'snmpV3PrivacyPassword', 'sshPassword']) {
    assert.equal(Object.hasOwn(payload, key), false);
  }
});
check('Legacy v1 stays v1 when editing another field', () => {
  const legacy = { ...device, snmpVersion: '1' };
  assert.equal(buildEditPayload({ ...createEditForm(legacy), pollingInterval: 60 }).snmpVersion, 'v1');
});
check('Version switch requires new v3 credentials', () => {
  const form = { ...createEditForm(device), snmpVersion: 'v3' };
  assert.deepEqual(Object.keys(validateEditForm(form, device)), ['snmp-v3-username', 'snmp-v3-auth-password', 'snmp-v3-privacy-password']);
});
check('Stored v3 secrets stay optional; replacement length limits still apply', () => {
  const stored = { ...device, snmpVersion: '3', snmpV3Username: 'fixture', hasSnmpV3AuthPassword: true, hasSnmpV3PrivacyPassword: true };
  assert.deepEqual(validateEditForm(createEditForm(stored), stored), {});
  for (const value of ['short', 'x'.repeat(256)]) {
    const errors = validateEditForm({ ...createEditForm(stored), snmpV3AuthPassword: value, snmpV3PrivacyPassword: value }, stored);
    assert.ok(errors['snmp-v3-auth-password']); assert.ok(errors['snmp-v3-privacy-password']);
  }
});
check('Inactive secrets do not enter payload or change summary', () => {
  const form = { ...createEditForm(device), snmpV3AuthPassword: 'hidden-auth-fixture', snmpV3PrivacyPassword: 'hidden-privacy-fixture' };
  assert.deepEqual(getEditChanges(form, device), []);
  assert.equal(Object.hasOwn(buildEditPayload(form), 'snmpV3AuthPassword'), false);
  const v3 = { ...form, snmpVersion: 'v3', snmpV3SecurityLevel: 'authNoPriv', snmpV3Username: 'fixture', snmpCommunity: 'hidden-community-fixture' };
  const payload = buildEditPayload(v3);
  for (const key of ['snmpV3PrivacyPassword', 'snmpV3PrivacyProtocol', 'snmpCommunity']) assert.equal(Object.hasOwn(payload, key), false);
  assert.equal(getEditChanges(v3, device).some(row => row.label === 'Şifreleme parolası'), false);
});
check('Summary never contains entered secrets', () => {
  const form = { ...createEditForm(device), snmpCommunity: 'community-fixture-secret', sshPassword: 'ssh-fixture-secret' };
  const rows = getEditChanges(form, device);
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.secret && row.after === 'Yeni değer girildi'));
  assert.doesNotMatch(JSON.stringify(rows), /community-fixture-secret|ssh-fixture-secret/);
});
check('Ports and intervals enforce integer boundaries even when polling is paused', () => {
  for (const value of [0, 65536, 1.5]) {
    const errors = validateEditForm({ ...createEditForm(device), snmpPort: value, sshPort: value }, device);
    assert.ok(errors['snmp-port']); assert.ok(errors['ssh-port']);
  }
  for (const value of [9, 86401, 10.5]) assert.ok(validateEditForm({ ...createEditForm(device), pollingEnabled: false, pollingInterval: value }, device)['polling-interval']);
  for (const value of [10, 86400]) assert.deepEqual(validateEditForm({ ...createEditForm(device), pollingInterval: value }, device), {});
  assert.equal(buildEditPayload({ ...createEditForm(device), pollingEnabled: false }).pollingInterval, 300);
});
check('Community and username constraints give specific field errors', () => {
  for (const value of [' ', 'x'.repeat(256)]) assert.ok(validateEditForm({ ...createEditForm(device), snmpCommunity: value }, device)['snmp-community']);
  assert.ok(validateEditForm({ ...createEditForm(device), managementIp: '' }, device)['management-ip']);
  assert.ok(validateEditForm({ ...createEditForm(device), sshUsername: '', sshPassword: 'fixture' }, device)['ssh-username']);
  assert.ok(validateEditForm({ ...createEditForm(device), snmpVersion: 'v3', snmpV3Username: 'invalid user' }, device)['snmp-v3-username']);
  assert.deepEqual(getEditChanges({ ...createEditForm(device), managementIp: ' 192.0.2.10 ' }, device), []);
});
console.log(`${checks} NMS edit form checks passed.`);
