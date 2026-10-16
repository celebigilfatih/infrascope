const building = { id: 'test-building', name: 'TEST · Merkez bina', city: 'Örnek konum', organizationId: 'test-org' };
const rack = { id: 'test-rack', name: 'K-01', room: { id: 'test-room', name: 'Sistem odası', floor: { id: 'test-floor', name: 'Zemin kat', floorNumber: 0, building } } };
const devices = [
  { id: 'core', name: 'TEST-OMURGA-01', type: 'SWITCH', vendor: 'Cisco', status: 'ACTIVE', criticality: 'HIGH', managementIp: '192.0.2.10', rack, networkInterfaces: [{ id: 'core-1', name: 'Gi1/0/1', ipv4: '192.0.2.10', status: 'UP' }] },
  { id: 'access', name: 'TEST-ERİŞİM-01', type: 'SWITCH', status: 'MAINTENANCE', criticality: 'MEDIUM', managementIp: '192.0.2.20', rack, networkInterfaces: [{ id: 'access-1', name: 'Gi0/1', status: 'DORMANT' }] },
  { id: 'server', name: 'TEST-SUNUCU-01', type: 'SERVER', status: 'INACTIVE', criticality: 'CRITICAL', managementIp: '192.0.2.30', networkInterfaces: [{ id: 'server-1', name: 'eth0', status: 'DOWN' }] },
  { id: 'unknown', name: 'TEST-DURUMSUZ-01', type: 'ROUTER', status: 'UNKNOWN', criticality: 'LOW', managementIp: null, networkInterfaces: [{ id: 'unknown-1', name: 'eth1', status: 'UNKNOWN' }] },
];
const connections = ['access', 'server', 'unknown'].map((id, i) => ({
  id: `test-link-${i}`, name: `TEST · Bağlantı ${i+1}`, type: 'ETHERNET', status: ['UP', 'DOWN', 'UNKNOWN'][i],
  sourcePort: { name: `Gi1/0/${i+1}`, switchDevice: { id: 'core' } },
  sourceInterfaceId: `${id}-1`, sourceInterface: { ...devices.find(device => device.id === id).networkInterfaces[0], device: { id } },
}));
const organizations = [{ id: 'test-org', name: 'TEST Kuruluşu', code: 'TEST', buildings: [{ ...building, floors: [{ ...rack.room.floor, rooms: [{ ...rack.room, racks: [{ id: rack.id, name: rack.name }] }] }] }] }];
const telemetry = [{ deviceId: 'core', deviceName: devices[0].name, portDownCount: 1, downPorts: [{ id: 'test-port', interfaceName: 'Gi1/0/2', description: 'TEST · İzlenen bağlantı', downSince: '2026-10-15T11:00:00Z', lastPolledAt: '2026-10-16T12:00:00Z', adminStatus: 'up', operStatus: 'down', monitored: true }] }];
module.exports = { devices, connections, organizations, telemetry };
