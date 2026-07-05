import { PrismaClient, Priority } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'demo@sammtech.dev' },
    update: {},
    create: {
      name: 'Demo User',
      email: 'demo@sammtech.dev',
      password: passwordHash,
    },
  });

  const board = await prisma.board.create({
    data: {
      title: 'Demo Kanban Board',
      userId: user.id,
      columns: {
        create: [
          { title: 'Backlog', order: 0 },
          { title: 'Todo', order: 1 },
          { title: 'In Progress', order: 2 },
          { title: 'Review', order: 3 },
          { title: 'Done', order: 4 },
        ],
      },
    },
    include: { columns: true },
  });

  const todoColumn = board.columns.find((c) => c.title === 'Todo');

  if (todoColumn) {
    await prisma.task.create({
      data: {
        title: 'Set up project repository',
        description: 'Initialize the repo, push to GitHub, and configure CI',
        priority: Priority.HIGH,
        columnId: todoColumn.id,
        position: 0,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log('✅ Seed complete. Demo login: demo@sammtech.dev / Password123');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
