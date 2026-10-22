import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { BoardsService } from '../../src/boards/boards.service';
import { TasksService } from '../../src/tasks/tasks.service';

let app: INestApplication, db: PrismaService;
const users: string[] = [];
let owner: string, outsider: string, token: string, outsiderToken: string;

before(async () => {
  if (!process.env.DATABASE_URL?.includes('sammtech_test'))
    throw new Error('Subscription integration tests require isolated sammtech_test database');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  db = app.get(PrismaService);
  const jwt = app.get(JwtService);
  for (const name of ['owner', 'outsider']) {
    const user = await db.user.create({
      data: {
        name,
        email: `plans-${name}-${Date.now()}-${Math.random()}@example.test`,
        password: 'unused-test-hash',
      },
    });
    users.push(user.id);
  }
  [owner, outsider] = users;
  token = await jwt.signAsync({ sub: owner, email: 'owner@example.test' });
  outsiderToken = await jwt.signAsync({ sub: outsider, email: 'outsider@example.test' });
});

after(async () => {
  if (db) await db.user.deleteMany({ where: { id: { in: users } } });
  await app?.close();
});

test('subscription preview requires authentication and returns only the current owner usage', async () => {
  const boards = app.get(BoardsService),
    tasks = app.get(TasksService);
  const ownBoard = await boards.create(owner, { title: 'Owner preview project' });
  const foreignBoard = await boards.create(outsider, { title: 'Private other preview project' });
  await tasks.create(owner, ownBoard.columns[0].id, { title: 'Owned preview task' });
  await tasks.create(outsider, foreignBoard.columns[0].id, { title: 'Private task 1' });
  await tasks.create(outsider, foreignBoard.columns[0].id, { title: 'Private task 2' });
  await db.workspaceFile.createMany({
    data: [
      { userId: owner, name: 'Own note', content: 'owned' },
      { userId: outsider, name: 'Other note', content: 'private' },
    ],
  });
  await request(app.getHttpServer()).get('/workspace/subscription').expect(401);
  const response = await request(app.getHttpServer())
    .get(`/workspace/subscription?userId=${outsider}`)
    .auth(token, { type: 'bearer' })
    .expect(200);
  assert.equal(response.body.plan, 'STARTER');
  assert.equal(response.body.status, 'preview');
  assert.equal(response.body.billingConfigured, false);
  assert.equal(response.body.paidPlansAvailable, false);
  assert.equal(response.body.entitlements.teamAdministration, false);
  assert.equal(response.body.entitlements.paidBilling, false);
  assert.equal(response.body.entitlements.automations, true);
  assert.equal(response.body.usage.boards, 1);
  assert.equal(response.body.usage.tasks, 1);
  assert.equal(response.body.usage.files, 1);
  assert.equal(response.body.limits.concurrentAgentRuns, 2);
  assert.equal(
    response.body.plans.find((plan: { id: string }) => plan.id === 'PRO').available,
    false,
  );
  const other = await request(app.getHttpServer())
    .get('/workspace/subscription')
    .auth(outsiderToken, { type: 'bearer' })
    .expect(200);
  assert.equal(other.body.usage.tasks, 2);
  assert.equal(JSON.stringify(response.body).includes('Private task'), false);
});

test('plan interest is confirmed, owner-scoped, deduplicated and never activates a subscription', async () => {
  const route = '/workspace/subscription/upgrade-interest';
  await request(app.getHttpServer()).post(route).send({ plan: 'PRO', approved: true }).expect(401);
  for (const body of [
    { plan: 'PRO', approved: false },
    { plan: 'PRO', approved: true, userId: outsider },
  ]) {
    await request(app.getHttpServer())
      .post(route)
      .auth(token, { type: 'bearer' })
      .send(body)
      .expect(400);
  }
  const responses = await Promise.all(
    [0, 1].map(() =>
      request(app.getHttpServer())
        .post(route)
        .auth(token, { type: 'bearer' })
        .send({ plan: 'PRO', approved: true })
        .expect(201),
    ),
  );
  assert.equal(responses[0].body.recordId, responses[1].body.recordId);
  assert.equal(responses[0].body.subscriptionChanged, false);
  assert.equal(responses[0].body.charged, false);
  assert.equal(
    await db.auditLog.count({ where: { userId: owner, action: 'subscription.interest.recorded' } }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { userId: outsider, action: 'subscription.interest.recorded' },
    }),
    0,
  );
  const current = await request(app.getHttpServer())
    .get('/workspace/subscription')
    .auth(token, { type: 'bearer' })
    .expect(200);
  assert.equal(current.body.plan, 'STARTER');
  assert.equal(current.body.entitlements.paidBilling, false);
});
