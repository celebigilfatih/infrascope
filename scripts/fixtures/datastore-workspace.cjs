function mount(id, overrides = {}) {
  return { id, name: 'ESXi-ÜRETİM-01', connectionState: 'connected', mounted: true, accessible: true, accessMode: 'readWrite', inaccessibleReason: null, ...overrides };
}
function datastore(id, overrides = {}) {
  return { id, name: 'ÜRETİM-VMFS-01', type: 'VMFS', accessible: true, capacityBytes: 10*1024**4, freeBytes: 4*1024**4, maintenanceMode: 'normal', multipleHostAccess: true, hosts: [mount('host-101'), mount('host-102', { name: 'ESXi-ÜRETİM-02' })], ...overrides };
}
const datastores = [
  datastore('datastore-101'),
  datastore('datastore-102', { name: 'VERİTABANI-SSD', capacityBytes: 4*1024**4, freeBytes: 0.2*1024**4, hosts: [mount('host-101'), mount('host-102', { name: 'ESXi-ÜRETİM-02', accessible: false, inaccessibleReason: 'AllPathsDown_Timeout' })] }),
  datastore('datastore-201', { name: 'YEDEK-NFS', type: 'NFS', capacityBytes: 20*1024**4, freeBytes: 4*1024**4, hosts: [mount('host-301', { name: 'ESXi-LAB', accessMode: 'readOnly' })], multipleHostAccess: false }),
  datastore('datastore-301', { name: 'ARŞİV-DEPOSU', accessible: false, capacityBytes: null, freeBytes: null, hosts: [mount('host-301', { name: 'ESXi-LAB', accessible: false, connectionState: 'disconnected' })] }),
  datastore('datastore-401', { name: 'BAKIM-DEPOSU', maintenanceMode: 'inMaintenance', capacityBytes: 2*1024**4, freeBytes: 0, hosts: [], multipleHostAccess: false }),
  datastore('datastore-501', { name: 'BİLGİ-BEKLENİYOR', type: 'unknown', accessible: null, capacityBytes: null, freeBytes: null, maintenanceMode: 'unknown', multipleHostAccess: null, hosts: null }),
];
module.exports = { datastore, mount, datastores };
