const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addRacks() {
  try {
    // Get all rooms
    const rooms = await prisma.room.findMany();
    
    if (rooms.length === 0) {
      console.log('No rooms found in database!');
      return;
    }

    console.log(`Found ${rooms.length} rooms.`);

    for (const room of rooms) {
      console.log(`\n📍 Processing room: ${room.name} (${room.id})`);
      
      // Check if room already has racks
      const existingRacksCount = await prisma.rack.count({
        where: { roomId: room.id }
      });

      if (existingRacksCount > 0) {
        console.log(`  Room already has ${existingRacksCount} racks. Skipping...`);
        continue;
      }

      console.log(`  Adding 4 racks to ${room.name}...`);

      const racksData = [
        { name: 'Rack-01', type: 'RACK_42U', maxUnits: 42, coordX: 1.0, coordZ: 1.0, rotation: 0 },
        { name: 'Rack-02', type: 'RACK_42U', maxUnits: 42, coordX: 2.5, coordZ: 1.0, rotation: 0 },
        { name: 'Rack-03', type: 'RACK_45U', maxUnits: 45, coordX: 4.0, coordZ: 1.0, rotation: 0 },
        { name: 'Rack-04', type: 'RACK_45U', maxUnits: 45, coordX: 5.5, coordZ: 1.0, rotation: 0 },
      ];

      for (const rackData of racksData) {
        await prisma.rack.create({
          data: {
            ...rackData,
            roomId: room.id,
            operationalStatus: 'OPERATIONAL'
          }
        });
        console.log(`    ✓ Created ${rackData.name}`);
      }
    }

    console.log('\n✅ All racks added successfully!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addRacks();
