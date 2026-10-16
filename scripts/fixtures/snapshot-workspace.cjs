const NOW = Date.parse('2026-10-16T13:00:00Z'), DAY = 86400000;
function snapshot(id, overrides = {}) { return { id, name: 'Güncelleme öncesi', description: 'Uygulama güncellemesinden önce oluşturulan geri dönüş noktası.', createTime: new Date(NOW-8*DAY).toISOString(), state: 'poweredOn', fileKeys: [1, 10], ...overrides }; }
function vm(id, overrides = {}) { return { id, name: 'ÜRETİM-UYGULAMA-01', template: false, connectionState: 'connected', powerState: 'poweredOn', snapshots: [snapshot('snapshot-1')], files: [{ key: 1, sizeBytes: 1024**2 }, { key: 10, sizeBytes: 20*1024**3 }], ...overrides }; }
const vms = [
  vm('vm-101', { snapshots: [snapshot('snapshot-1', { name: 'Eski sürüm — Eylül', createTime: new Date(NOW-45*DAY).toISOString() }), snapshot('snapshot-2', { name: 'Güvenlik yaması öncesi', fileKeys: [2, 10, 11] }), snapshot('snapshot-3', { name: 'Bugünkü güncelleme', createTime: new Date(NOW-2*3600000).toISOString(), fileKeys: [3, 10, 11, 12] })], files: [{ key: 1, sizeBytes: 1024**2 }, { key: 2, sizeBytes: 2*1024**2 }, { key: 3, sizeBytes: 3*1024**2 }, { key: 10, sizeBytes: 20*1024**3 }, { key: 11, sizeBytes: 3*1024**3 }, { key: 12, sizeBytes: 2*1024**3 }] }),
  vm('vm-102', { name: 'VERİTABANI-01', snapshots: [snapshot('snapshot-1', { name: 'Veritabanı bakımı öncesi', createTime: new Date(NOW-7*DAY).toISOString(), state: 'poweredOff' })], files: [{ key: 1, sizeBytes: 0 }, { key: 10, sizeBytes: 8*1024**3 }] }),
  vm('vm-201', { name: 'TEST-UYGULAMA', powerState: 'poweredOff', snapshots: [], files: [] }),
  vm('vm-401', { name: 'ERİŞİLEMEYEN-VM', connectionState: 'inaccessible', snapshots: [snapshot('snapshot-unknown', { name: 'Eksik ölçümlü görüntü', createTime: null, fileKeys: null })], files: null }),
  vm('vm-501', { name: 'SAAT-KONTROLÜ', connectionState: 'unknown', template: null, snapshots: [snapshot('snapshot-future', { name: 'Kaynak saati kontrol edilmeli', createTime: new Date(NOW+DAY).toISOString(), fileKeys: [1] })], files: [{ key: 1, sizeBytes: null }] }),
];
module.exports = { NOW, DAY, snapshot, vm, vms };
