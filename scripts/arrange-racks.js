const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function arrangeRacks() {
  try {
    // Get all racks from "Sunucu Odası" (Server Room)
    const room = await prisma.room.findFirst({
      where: { name: { contains: 'Sunucu' } },
      include: { racks: { orderBy: { name: 'asc' } } }
    });

    if (!room) {
      console.log('Room not found!');
      return;
    }

    console.log(`Found room: ${room.name}`);
    console.log(`Room size: ${room.width}m x ${room.depth}m`);
    console.log(`Number of racks: ${room.racks.length}`);

    const roomWidth = room.width || 10;
    const roomDepth = room.depth || 8;

    // Cabinet dimensions (updated to match new sizes)
    const rackWidth = 1.2;  // meters
    const rackDepth = 2.0;  // meters
    const spacing = 0.5;    // space between racks (increased)
    const rowGap = 1.0;     // gap between rows (NEW)

    // Calculate total width needed for 4 racks in a row
    const totalWidthPerRow = (4 * rackWidth) + (3 * spacing);
    
    // Calculate starting X position to center the row
    const startX = (roomWidth - totalWidthPerRow) / 2;
    
    // Position for first row (racks 1-4) - moved up a bit
    const row1Z = (roomDepth / 2) - rackDepth - (rowGap / 2);
    
    // Position for second row (racks 5-8) facing the first row - moved down a bit
    const row2Z = (roomDepth / 2) + (rowGap / 2);

    const updates = [];

    for (let i = 0; i < room.racks.length && i < 8; i++) {
      const rack = room.racks[i];
      let coordX, coordZ, rotation;

      if (i < 4) {
        // First row (racks 1-4): left to right
        coordX = startX + (i * (rackWidth + spacing));
        coordZ = row1Z;
        rotation = 0;  // facing down
      } else {
        // Second row (racks 5-8): left to right, facing row 1
        const posInRow = i - 4;
        coordX = startX + (posInRow * (rackWidth + spacing));
        coordZ = row2Z;
        rotation = 180;  // facing up (toward row 1)
      }

      updates.push({
        id: rack.id,
        name: rack.name,
        coordX,
        coordZ,
        rotation
      });

      console.log(`${rack.name}: X=${coordX.toFixed(2)}m, Z=${coordZ.toFixed(2)}m, Rotation=${rotation}°`);
    }

    // Update all racks
    for (const update of updates) {
      await prisma.rack.update({
        where: { id: update.id },
        data: {
          coordX: update.coordX,
          coordZ: update.coordZ,
          rotation: update.rotation
        }
      });
    }

    console.log('\n✅ All racks arranged successfully!');
    console.log('Refresh your browser to see the new layout.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

arrangeRacks();
