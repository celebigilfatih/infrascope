function vm(id, overrides = {}) {
  return { id, name: 'ÜRETİM-UYGULAMA-01', template: false, powerState: 'poweredOn', connectionState: 'connected', overallStatus: 'green', guestState: 'running', hostAssignment: 'assigned', hostId: 'host-101', hostName: 'ESXi-ÜRETİM-01', ip: '192.0.2.10', os: 'Ubuntu Linux 24.04', cpuCount: 4, cpuCapacityMHz: 10000, usedCpuMHz: 2500, memoryBytes: 16*1024**3, activeMemoryBytes: 6*1024**3, hostMemoryBytes: 12*1024**3, ...overrides };
}
const vms = [
  vm('vm-101'),
  vm('vm-102', { name: 'VERİTABANI-01', os: 'Microsoft Windows Server 2022', ip: '192.0.2.20', cpuCount: 8, memoryBytes: 32*1024**3, activeMemoryBytes: 28*1024**3, usedCpuMHz: 8200, overallStatus: 'yellow', guestState: 'unknown' }),
  vm('vm-201', { name: 'TEST-UYGULAMA', powerState: 'poweredOff', hostAssignment: 'unassigned', hostId: null, hostName: null, ip: null }),
  vm('vm-301', { name: 'ARŞİV-SUNUCUSU', powerState: 'suspended', hostId: 'host-301', hostName: 'ESXi-LAB', overallStatus: 'gray' }),
  vm('vm-401', { name: 'ERİŞİLEMEYEN-VM', connectionState: 'inaccessible', overallStatus: 'red', guestState: 'unknown', hostAssignment: 'unknown', hostId: null, hostName: null, usedCpuMHz: null, activeMemoryBytes: null }),
  vm('vm-501', { name: 'ÖLÇÜM-BEKLENİYOR', powerState: 'unknown', connectionState: 'unknown', overallStatus: 'unknown', guestState: 'unknown', cpuCount: null, memoryBytes: null, usedCpuMHz: null, activeMemoryBytes: null, hostAssignment: 'unknown', hostId: null, hostName: null }),
];
module.exports = { vm, vms };
