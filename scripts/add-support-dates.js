const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    // Get first 5 devices
    const devices = await prisma.device.findMany({ take: 5 });
    
    for (let i = 0; i < devices.length; i++) {
      // Add varying support dates: some expiring soon, some expired
      let supportDate;
      if (i === 0) {
        supportDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
      } else if (i === 1) {
        supportDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000); // 12 days from now
      } else if (i === 2) {
        supportDate = new Date(Date.now() + 25 * 24 * 60 * 60 * 1000); // 25 days from now
      } else if (i === 3) {
        supportDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago (expired)
      } else {
        supportDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45 days from now
      }
      
      await prisma.device.update({
        where: { id: devices[i].id },
        data: { supportDate }
      });
      console.log(`Updated ${devices[i].name} with support date: ${supportDate.toISOString()}`);
    }
    
    console.log('Done!');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
})();
