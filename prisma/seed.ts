import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const systemCategories = [
  { name: 'Food', color: '#ef4444' },
  { name: 'Transport', color: '#3b82f6' },
  { name: 'Housing', color: '#8b5cf6' },
  { name: 'Utilities', color: '#f59e0b' },
  { name: 'Entertainment', color: '#ec4899' },
  { name: 'Health', color: '#10b981' },
  { name: 'Shopping', color: '#f97316' },
  { name: 'Education', color: '#06b6d4' },
  { name: 'Other', color: '#6b7280' },
];

async function main() {
  for (const category of systemCategories) {
    const existing = await prisma.category.findFirst({
      where: { name: category.name, userId: null },
    });

    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { color: category.color },
      });
    } else {
      await prisma.category.create({
        data: { name: category.name, color: category.color },
      });
    }
  }
  console.log(`Seeded ${systemCategories.length} system categories`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
