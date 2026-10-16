const NOW = Date.parse('2026-10-16T13:00:00Z');
function device(id, overrides = {}, now = NOW) {
  return { id, name: `TEST-${id.toUpperCase()}`, type: 'SWITCH', vendor: 'Örnek üretici', nmsDeviceId: 100 + id.length, managementIp: '192.0.2.10', snmpVersion: '2c', snmpPort: 161, pollingEnabled: true, pollingInterval: 300, lastPolledAt: new Date(now - 60000).toISOString(), latestHealth: { cpuUsage: 0, memoryUsage: 84.5, temperature: null, collectedAt: new Date(now - 60000).toISOString() }, portDownCount: 0, ...overrides };
}
function rows(now = NOW) {
  return [
    device('guncel', {}, now),
    device('gecikmis', { lastPolledAt: new Date(now - 3600000).toISOString(), portDownCount: 2, latestHealth: { cpuUsage: 91, memoryUsage: 96, temperature: null, collectedAt: new Date(now - 3600000).toISOString() } }, now),
    device('kapali', { pollingEnabled: false }, now),
    device('verisiz', { lastPolledAt: null, latestHealth: null }, now),
    device('gelecek', { lastPolledAt: new Date(now + 3600000).toISOString(), latestHealth: { cpuUsage: null, memoryUsage: 125, temperature: null, collectedAt: new Date(now + 3600000).toISOString() } }, now),
    device('eski-olcum', { latestHealth: { cpuUsage: 36, memoryUsage: null, temperature: null, collectedAt: new Date(now - 86400000).toISOString() } }, now),
  ];
}
module.exports = { NOW, device, rows };
