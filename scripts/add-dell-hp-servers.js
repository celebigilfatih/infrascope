// Script to add Dell and HP servers to the database
const API_BASE = 'http://localhost:8170/api';

async function addDevices() {
  // Get racks
  const racksRes = await fetch(`${API_BASE}/racks`);
  const racksData = await racksRes.json();
  const kabinet4 = racksData.data.find(r => r.name === 'Kabinet_4');
  
  if (!kabinet4) {
    console.error('Rack not found!');
    return;
  }

  // Devices from the image (IPs inferred from screenshot)
  const devices = [
    { name: 'Dell-R750xs-1', vendor: 'Dell Inc.', model: 'PowerEdge R750xs', ip: '10.5.56.12' },
    { name: 'Dell-R750xs-2', vendor: 'Dell Inc.', model: 'PowerEdge R750xs', ip: '10.5.56.13' },
    { name: 'Dell-R750xs-3', vendor: 'Dell Inc.', model: 'PowerEdge R750xs', ip: '10.5.56.14' },
    { name: 'Dell-R750xs-4', vendor: 'Dell Inc.', model: 'PowerEdge R750xs', ip: '10.5.56.11' },
    { name: 'Dell-R830-1', vendor: 'Dell Inc.', model: 'PowerEdge R830', ip: '10.5.56.15' },
    { name: 'Dell-R730-1', vendor: 'Dell Inc.', model: 'PowerEdge R730', ip: '10.5.55.133' },
    { name: 'HP-DL380-Gen9', vendor: 'HP', model: 'ProLiant DL380 Gen9', ip: '10.5.0.121' },
    { name: 'Dell-R830-2', vendor: 'Dell Inc.', model: 'PowerEdge R830', ip: '10.5.56.16' },
  ];

  for (const device of devices) {
    try {
      const createRes = await fetch(`${API_BASE}/devices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: device.name,
          type: 'PHYSICAL_SERVER',
          vendor: device.vendor,
          model: device.model,
          serialNumber: `SN-${device.name}`,
          criticality: 'MEDIUM',
          status: 'ACTIVE',
          rackId: kabinet4.id,
          supportDate: '2026-12-31',
        }),
      });
      
      const createResult = await createRes.json();
      if (createResult.success) {
        console.log(`✓ Created ${device.name} (${device.vendor} ${device.model}) - IP: ${device.ip}`);
      } else {
        console.error(`✗ Failed to create ${device.name}:`, createResult.error);
      }
    } catch (err) {
      console.error(`✗ Error adding ${device.name}:`, err.message);
    }
  }
}

addDevices();
