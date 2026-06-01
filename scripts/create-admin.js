const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAdmin() {
  const hashed = await bcrypt.hash('123456', 12);
  const user = await prisma.user.create({
    data: {
      name: 'Fatih Çelebigil',
      email: 'fatihcelebigil@gmail.com',
      password: hashed,
      role: 'ADMIN',
      status: 'ACTIVE'
    }
  });
  console.log('✅ User created:', user.id, user.email, user.role);
  await prisma.$disconnect();
}

createAdmin().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
