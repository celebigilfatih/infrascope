const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setupRoom() {
  try {
    // Find the server room
    const room = await prisma.room.findFirst({
      where: { name: { contains: 'Sunucu' } },
      include: { racks: true }
    });

    if (!room) {
      console.log('Room not found!');
      return;
    }

    console.log(`\n📍 Current room: ${room.name}`);
    console.log(`Current size: ${room.width}m x ${room.depth}m`);
    console.log(`Current racks: ${room.racks.length}`);

    // Update room dimensions
    await prisma.room.update({
      where: { id: room.id },
      data: {
        width: 10,
        depth: 8
      }
    });

    console.log(`\n✅ Updated room size to: 10m x 8m`);

    // Create 4 more racks if we only have 4
    if (room.racks.length < 8) {
      const racksToCreate = 8 - room.racks.length;
      console.log(`\n➕ Creating ${racksToCreate} additional racks...`);

      for (let i = room.racks.length + 1; i <= 8; i++) {
        await prisma.rack.create({
          data: {
            name: `Kabinet_${i}`,
            type: i % 2 === 0 ? 'RACK_42U' : 'RACK_45U',
            maxUnits: i % 2 === 0 ? 42 : 45,
            roomId: room.id,
            operationalStatus: 'OPERATIONAL',
            coordX: 0,
            coordZ: 0,
            rotation: 0
          }
        });
        console.log(`  ✓ Created Kabinet_${i}`);
      }
    }

    console.log('\n✅ Room setup complete!');
    console.log('Now run: docker exec infrascope-web-dev node scripts/arrange-racks.js');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupRoom();
