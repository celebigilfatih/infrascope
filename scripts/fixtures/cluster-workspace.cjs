const host = (id, changes = {}) => ({ id, name: `esxi-${id}.ornek.local`, connectionState: 'connected', powerState: 'poweredOn', overallStatus: 'green', maintenance: false, cpuCores: 32, totalCpuMHz: 80000, totalMemoryBytes: 512 * 1024 ** 3, usedCpuMHz: 32000, usedMemoryBytes: 192 * 1024 ** 3, version: '8.0.3', ...changes });
const cluster = (id, changes = {}) => ({ id, name: `Küme ${id}`, overallStatus: 'green', hostCount: 2, effectiveHosts: 2, cpuCores: 64, totalCpuMHz: 160000, totalMemoryBytes: 1024 ** 4, haEnabled: true, drsEnabled: true, hosts: [host(`${id}-01`), host(`${id}-02`)], ...changes });
const clusters = [
  cluster('domain-c101', { name: 'Üretim Kümesi' }),
  cluster('domain-c102', { name: 'Yedekleme Kümesi', effectiveHosts: 1, hosts: [host('yedek-01'), host('yedek-02', { maintenance: true })] }),
  cluster('domain-c103', { name: 'Test Kümesi', effectiveHosts: 1, hosts: [host('test-01'), host('test-02', { connectionState: 'notResponding', overallStatus: 'gray', usedCpuMHz: null, usedMemoryBytes: null })] }),
  cluster('domain-c104', { name: 'Yeni Küme', overallStatus: 'gray', hostCount: 0, effectiveHosts: 0, cpuCores: 0, totalCpuMHz: 0, totalMemoryBytes: 0, hosts: [] }),
];
module.exports = { host, cluster, clusters };
