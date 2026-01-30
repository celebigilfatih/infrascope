const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  try {
    console.log('--- DATABASE DIAGNOSTIC ---');
    const buildings = await prisma.building.findMany();
    console.log(`Buildings (${buildings.length}):`, buildings.map(b => b.name));

    const devices = await prisma.device.findMany();
    console.log(`Total Devices in DB: ${devices.length}`);
    if (devices.length > 0) {
      console.log('Sample devices:', devices.slice(0, 5).map(d => d.name));
    }
  } catch (error) {
    console.error('Diagnostic failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();
