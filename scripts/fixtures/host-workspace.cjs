// Shared synthetic data for isolated checks and the browser fixture.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { host: clusterHost, clusters } = require('./cluster-workspace.cjs');
const host = (id, changes = {}) => ({ ...clusterHost(id), vendor: 'Dell', model: 'PowerEdge R750', build: '24022510', clusterMembership: 'cluster', clusterId: 'domain-c101', clusterName: 'Üretim Kümesi', ...changes });
const hosts = [
  host('host-101', { name: 'esxi-uretim-01.ornek.local' }),
  host('host-102', { name: 'esxi-uretim-02.ornek.local', maintenance: true, usedCpuMHz: 8000, usedMemoryBytes: 64 * 1024 ** 3 }),
  host('host-201', { name: 'esxi-yedek-01.ornek.local', clusterId: 'domain-c102', clusterName: 'Yedekleme Kümesi', connectionState: 'notResponding', overallStatus: 'gray', usedCpuMHz: null, usedMemoryBytes: null }),
  host('host-301', { name: 'esxi-bagimsiz-01.ornek.local', clusterMembership: 'standalone', clusterId: null, clusterName: null, vendor: 'HPE', model: 'ProLiant DL380', usedCpuMHz: 56000, usedMemoryBytes: 384 * 1024 ** 3 }),
  host('host-401', { name: 'esxi-yeni-01.ornek.local', clusterMembership: 'unknown', clusterId: null, clusterName: null, overallStatus: 'gray', connectionState: 'unknown', maintenance: null, totalCpuMHz: null, cpuCores: null, totalMemoryBytes: null, usedCpuMHz: null, usedMemoryBytes: null, vendor: null, model: null, version: null, build: null }),
];
module.exports = { host, hosts, clusters };
