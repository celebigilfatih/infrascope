const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run create-admin.js in production. Use the /setup wizard instead.');
  process.exit(1);
}

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Local Admin';

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function createAdmin() {
  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name,
      email,
      password: hashed,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    update: {
      password: hashed,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('User ready:', user.id, user.email, user.role);
}

createAdmin()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
