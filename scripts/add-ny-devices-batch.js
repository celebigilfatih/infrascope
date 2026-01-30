const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addDevices() {
  try {
    console.log('🔍 Locating New York Data Center...');
    
    const building = await prisma.building.findFirst({
      where: { name: { contains: 'New York', mode: 'insensitive' } },
      include: { 
        floors: { 
          include: { 
            rooms: { 
              include: { 
                racks: true 
              } 
            } 
          } 
        } 
      }
    });

    if (!building) {
      console.error('❌ New York building not found in database.');
      const allBuildings = await prisma.building.findMany();
      console.log('Available buildings:', allBuildings.map(b => b.name));
      return;
    }

    let targetRack = null;
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        if (room.racks && room.racks.length > 0) {
          targetRack = room.racks[0];
          break;
        }
      }
      if (targetRack) break;
    }

    if (!targetRack) {
      console.error('❌ No racks found in the New York Data Center.');
      return;
    }

    console.log(`✅ Target identified: Building [${building.name}], Rack [${targetRack.name}]`);

    const devicesToCreate = [
      { name: 'NY-SRV-01', type: 'PHYSICAL_SERVER', vendor: 'Dell', model: 'PowerEdge R750', uPos: 1, uHeight: 2 },
      { name: 'NY-SRV-02', type: 'PHYSICAL_SERVER', vendor: 'Dell', model: 'PowerEdge R750', uPos: 3, uHeight: 2 },
      { name: 'NY-SW-01',  type: 'SWITCH', vendor: 'Cisco', model: 'Nexus 9300', uPos: 5, uHeight: 1 },
      { name: 'NY-SW-02',  type: 'SWITCH', vendor: 'Cisco', model: 'Nexus 9300', uPos: 6, uHeight: 1 },
      { name: 'NY-FW-01',  type: 'FIREWALL', vendor: 'Fortinet', model: 'FortiGate 200F', uPos: 7, uHeight: 1 },
      { name: 'NY-FW-02',  type: 'FIREWALL', vendor: 'Fortinet', model: 'FortiGate 200F', uPos: 8, uHeight: 1 },
      { name: 'NY-SRV-03', type: 'PHYSICAL_SERVER', vendor: 'HP', model: 'ProLiant DL380', uPos: 10, uHeight: 2 },
      { name: 'NY-SRV-04', type: 'PHYSICAL_SERVER', vendor: 'HP', model: 'ProLiant DL380', uPos: 12, uHeight: 2 },
      { name: 'NY-SW-03',  type: 'SWITCH', vendor: 'Juniper', model: 'QFX5120', uPos: 14, uHeight: 1 },
      { name: 'NY-SRV-05', type: 'PHYSICAL_SERVER', vendor: 'Supermicro', model: 'SYS-220U', uPos: 16, uHeight: 2 },
    ];

    console.log(`🚀 Adding 10 devices to rack ${targetRack.name}...`);

    for (const d of devicesToCreate) {
      const existing = await prisma.device.findFirst({ where: { name: d.name } });
      if (existing) {
        console.log(`  - Skipping ${d.name} (already exists)`);
        continue;
      }

      const device = await prisma.device.create({
        data: {
          name: d.name,
          type: d.type,
          vendor: d.vendor,
          model: d.model,
          serialNumber: `SN-NY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          assetTag: `ASSET-NY-${Math.floor(1000 + Math.random() * 9000)}`,
          criticality: 'HIGH',
          status: 'ACTIVE',
          rackId: targetRack.id,
          rackUnitPosition: d.uPos,
          metadata: {
            unitHeight: d.uHeight,
            installDate: new Date().toISOString()
          }
        }
      });
      console.log(`  ✓ Added: ${device.name} at U${d.uPos}`);
    }

    console.log('\n✨ Task completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addDevices();
