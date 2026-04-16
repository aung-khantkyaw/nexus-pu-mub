import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import logger from '../src/config/logger';
import bcrypt from "bcrypt";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminName = process.env.ADMIN_NAME;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminUsername || !adminName || !adminPassword) {
    logger.error("FATAL ERROR: Missing ADMIN in environment variables. Application cannot start.");
  throw new Error("Missing ADMIN in environment variables");
  }
  
  const hashedPassword = await bcrypt.hash(adminPassword, 10)

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {}, 
    create: {
      email: adminEmail,
      username: adminUsername,
      name: adminName,
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  console.log('Admin user created/verified:', admin.email)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })