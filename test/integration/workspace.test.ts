import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksService } from '../../src/tasks/tasks.service';
import { BoardsService } from '../../src/boards/boards.service';
import { ColumnsService } from '../../src/columns/columns.service';
import { WorkspaceService } from '../../src/workspace/workspace.service';
import { AutomationService } from '../../src/workspace/automation.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

let app: INestApplication,
  db: PrismaService,
  work: WorkspaceService,
  boards: BoardsService,
  tasks: TasksService,
  columns: ColumnsService;
let owner: string, outsider: string, token: string, outsiderToken: string;
const users: string[] = [];
let originalGateway: WorkspaceService['gateway'];
before(async () => {
  if (!process.env.DATABASE_URL?.includes('sammtech_test'))
    throw new Error('Integration tests require isolated sammtech_test database');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  db = app.get(PrismaService);
  work = app.get(WorkspaceService);
  tasks = app.get(TasksService);
  boards = app.get(BoardsService);
  columns = app.get(ColumnsService);
  originalGateway = work.gateway;
  for (const name of ['owner', 'outsider']) {
    const user = await db.user.create({
      data: {
        name,
        email: `${name}-${Date.now()}-${Math.random()}@example.test`,
        password: 'unused-test-hash',
      },
    });
    users.push(user.id);
  }
  [owner, outsider] = users;
  const jwt = app.get(JwtService);
  token = await jwt.signAsync({ sub: owner, email: 'owner@example.test' });
  outsiderToken = await jwt.signAsync({ sub: outsider, email: 'outsider@example.test' });
});
after(async () => {
  if (work) work.gateway = originalGateway;
  if (db) {
    await db.aiProposal.deleteMany({ where: { userId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  }
  await app?.close();
});

test('AI task approval enforces ownership, validates drafts, persists audit and is idempotent across retries', async () => {
  const board = await boards.create(owner, { title: 'AI approval tests' });
  const foreignBoard = await boards.create(outsider, { title: 'Private outsider project' });
  await tasks.create(outsider, foreignBoard.columns[0].id, { title: 'Private outsider task' });
  let seenTasks: { title: string }[] = [];
  work.gateway = async (_path: string, body: any) => {
    seenTasks = body.tasks;
    return {
      mode: 'lightweight',
      engine: 'test response fixture',
      drafts: [{ title: 'Fix Login Bug', priority: 'HIGH', dueDate: null, estimateMinutes: 60 }],
    };
  };
  const prepared = await request(app.getHttpServer())
    .post('/ai/interpret')
    .auth(token, { type: 'bearer' })
    .send({ boardId: board.id, text: 'Create a task called Fix Login Bug' })
    .expect(201);
  assert.ok(prepared.body.proposalId);
  assert.ok(!seenTasks.some((task) => task.title === 'Private outsider task'));
  assert.equal(await db.task.count({ where: { columnId: board.columns[0].id } }), 0);
  const id = prepared.body.proposalId;
  const approve = { approved: true, columnId: board.columns[0].id };
  await request(app.getHttpServer())
    .post(`/ai/proposals/${id}/approve`)
    .auth(token, { type: 'bearer' })
    .send({ ...approve, approved: false })
    .expect(400);
  await request(app.getHttpServer())
    .post(`/ai/proposals/${id}/approve`)
    .auth(outsiderToken, { type: 'bearer' })
    .send(approve)
    .expect(404);
  await request(app.getHttpServer())
    .post(`/ai/proposals/${id}/approve`)
    .auth(token, { type: 'bearer' })
    .send({ ...approve, columnId: foreignBoard.columns[0].id })
    .expect(404);
  await request(app.getHttpServer())
    .post(`/ai/proposals/${id}/approve`)
    .auth(token, { type: 'bearer' })
    .send({ ...approve, drafts: [{ title: 'Injected', position: 999 }] })
    .expect(400);
  const responses = await Promise.all(
    [0, 1].map(() =>
      request(app.getHttpServer())
        .post(`/ai/proposals/${id}/approve`)
        .auth(token, { type: 'bearer' })
        .send(approve)
        .expect(201),
    ),
  );
  assert.deepEqual(responses.map((r) => r.body.alreadyApplied).sort(), [false, true]);
  const persisted = await db.task.findMany({ where: { columnId: board.columns[0].id } });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].title, 'Fix Login Bug');
  assert.equal(
    await db.auditLog.count({
      where: { userId: owner, action: 'ai.proposal.approved', entityId: id },
    }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { userId: owner, action: 'task.created', entityId: persisted[0].id },
    }),
    1,
  );
  const fresh = await request(app.getHttpServer())
    .get(`/boards/${board.id}`)
    .auth(token, { type: 'bearer' })
    .expect(200);
  assert.equal(fresh.body.columns[0].tasks[0].id, persisted[0].id);
  await request(app.getHttpServer())
    .patch(`/tasks/${persisted[0].id}`)
    .auth(token, { type: 'bearer' })
    .send({ title: null })
    .expect(400);
  await request(app.getHttpServer())
    .patch(`/tasks/${persisted[0].id}`)
    .auth(token, { type: 'bearer' })
    .send({ priority: null })
    .expect(400);
  await request(app.getHttpServer())
    .patch(`/tasks/${persisted[0].id}`)
    .auth(token, { type: 'bearer' })
    .send({ dueDate: null })
    .expect(200);
  const expired = await db.aiProposal.create({
    data: {
      userId: owner,
      boardId: board.id,
      result: { drafts: [{ title: 'Expired task' }] },
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await request(app.getHttpServer())
    .post(`/ai/proposals/${expired.id}/approve`)
    .auth(token, { type: 'bearer' })
    .send(approve)
    .expect(400);
  const invalid = await db.aiProposal.create({
    data: {
      userId: owner,
      boardId: board.id,
      result: { drafts: [{ title: 'Corrupt cached draft', columnId: foreignBoard.columns[0].id }] },
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  await request(app.getHttpServer())
    .post(`/ai/proposals/${invalid.id}/approve`)
    .auth(token, { type: 'bearer' })
    .send(approve)
    .expect(400);
  work.gateway = async () => ({ mode: 'lightweight', drafts: [null] });
  await request(app.getHttpServer())
    .post('/ai/interpret')
    .auth(token, { type: 'bearer' })
    .send({ boardId: board.id, text: 'Malformed result' })
    .expect(503);
  work.gateway = originalGateway;
});

test('database-backed automation is exactly-once per schedule across workers, isolated by owner, and records failure', async () => {
  const board = await boards.create(owner, { title: 'Automation tests' });
  const foreign = await boards.create(outsider, { title: 'Foreign automation board' });
  const auto = app.get(AutomationService);
  const secondWorker = new AutomationService(db, tasks);
  const config = {
    name: 'Recurring review',
    kind: 'recurring-task',
    frequencyHours: 24,
    boardId: board.id,
    columnId: board.columns[0].id,
    task: { title: 'Review backlog' },
    approved: true,
  };
  await assert.rejects(auto.create(owner, { ...config, columnId: foreign.columns[0].id }));
  const rule = await auto.create(owner, config);
  await Promise.all([auto.tick(owner), secondWorker.tick(owner)]);
  assert.equal(await db.automationRun.count({ where: { ruleId: rule.id } }), 1);
  assert.equal(
    await db.task.count({ where: { columnId: board.columns[0].id, title: 'Review backlog' } }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { userId: owner, action: 'automation.executed', entityId: rule.id },
    }),
    1,
  );
  await assert.rejects(auto.toggle(outsider, rule.id, false));
  await auto.toggle(owner, rule.id, false);
  await db.automationRule.update({
    where: { id: rule.id },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });
  await auto.tick(owner);
  assert.equal(await db.automationRun.count({ where: { ruleId: rule.id } }), 1);
  const broken = await auto.create(owner, { ...config, name: 'Archived destination' });
  await boards.softDelete(owner, board.id);
  await auto.tick(owner);
  const failed = await db.automationRun.findFirstOrThrow({ where: { ruleId: broken.id } });
  assert.equal(failed.status, 'failed');
  assert.ok(failed.error);
  assert.equal(
    await db.auditLog.count({
      where: { userId: owner, action: 'automation.failed', entityId: broken.id },
    }),
    1,
  );
});

test('agent execution is bounded, cancellable, owner-isolated and auditable', async () => {
  const board = await boards.create(owner, { title: 'Agent limits' });
  work.gateway = async (_path: string, _body: unknown, signal?: AbortSignal) =>
    new Promise((_resolve, reject) => {
      if (signal?.aborted) reject(new Error('Cancelled'));
      signal?.addEventListener('abort', () => reject(new Error('Cancelled')), { once: true });
    });
  const goal = { agent: 'planner', text: 'Review priorities', boardId: board.id };
  const [first, second] = await Promise.all([
    work.runAgent(owner, goal),
    work.runAgent(owner, goal),
  ]);
  await assert.rejects(work.runAgent(owner, goal));
  await assert.rejects(work.cancelAgent(outsider, first.id));
  await work.cancelAgent(owner, first.id);
  await work.cancelAgent(owner, second.id);
  const rows = await db.agentRun.findMany({ where: { id: { in: [first.id, second.id] } } });
  assert.ok(rows.every((row) => row.status === 'cancelled'));
  assert.equal(
    await db.auditLog.count({
      where: { userId: owner, action: 'agent.cancelled', entityId: { in: [first.id, second.id] } },
    }),
    2,
  );
  const stale = await db.agentRun.create({
    data: {
      userId: owner,
      agent: 'qa',
      status: 'running',
      createdAt: new Date(Date.now() - 180000),
    },
  });
  await work.agents(owner);
  assert.equal((await db.agentRun.findUniqueOrThrow({ where: { id: stale.id } })).status, 'failed');
  assert.equal(
    await db.auditLog.count({
      where: { userId: owner, action: 'agent.failed', entityId: stale.id },
    }),
    1,
  );
  work.gateway = originalGateway;
});

test('column mutations share task write locks, keep contiguous ordering, and cannot cascade active tasks', async () => {
  const board = await boards.create(owner, { title: 'Column lifecycle' });
  const extra = await Promise.all(
    [0, 1, 2].map((index) =>
      columns.create(owner, board.id, { title: `Extra ${index}`, order: 1 }),
    ),
  );
  let ordered = await db.column.findMany({
    where: { boardId: board.id },
    orderBy: { order: 'asc' },
  });
  assert.deepEqual(
    ordered.map((column) => column.order),
    ordered.map((_, index) => index),
  );
  await columns.update(owner, extra[0].id, { order: 999 });
  const task = await tasks.create(owner, extra[0].id, {
    title: 'Must survive column deletion request',
  });
  await assert.rejects(columns.remove(owner, extra[0].id));
  assert.ok(await db.task.findUnique({ where: { id: task.id } }));
  const prerequisite = await tasks.create(owner, extra[1].id, { title: 'Prerequisite' });
  await tasks.dependency(owner, task.id, prerequisite.id);
  await tasks.remove(owner, prerequisite.id);
  await tasks.dependency(owner, task.id, prerequisite.id, true);
  assert.equal(await db.taskDependency.count({ where: { taskId: task.id } }), 0);
  await columns.remove(owner, extra[2].id);
  ordered = await db.column.findMany({ where: { boardId: board.id }, orderBy: { order: 'asc' } });
  assert.deepEqual(
    ordered.map((column) => column.order),
    ordered.map((_, index) => index),
  );
  await assert.rejects(columns.update(outsider, extra[0].id, { title: 'Hijacked' }));
});

test('JWT expiry and deleted users cannot authorize requests', async () => {
  const jwt = app.get(JwtService);
  const expired = await jwt.signAsync(
    { sub: owner, email: 'owner@example.test' },
    { expiresIn: -1 },
  );
  await request(app.getHttpServer())
    .get('/workspace')
    .auth(expired, { type: 'bearer' })
    .expect(401);
  const transient = await db.user.create({
    data: {
      name: 'Removed account',
      email: `removed-${Date.now()}@example.test`,
      password: 'unused',
    },
  });
  const removedToken = await jwt.signAsync({ sub: transient.id, email: transient.email });
  await db.user.delete({ where: { id: transient.id } });
  await request(app.getHttpServer())
    .get('/workspace')
    .auth(removedToken, { type: 'bearer' })
    .expect(401);
});

test('registration races return conflict safely and bcrypt passwords enforce UTF-8 byte limits on login', async () => {
  const email = `race-${Date.now()}@example.test`;
  const password = '👾'.repeat(18); // 72 UTF-8 bytes; fewer than 72 characters.
  const registrations = await Promise.all(
    [0, 1].map(() =>
      request(app.getHttpServer())
        .post('/auth/register')
        .send({ name: 'Race User', email, password }),
    ),
  );
  assert.deepEqual(registrations.map((response) => response.status).sort(), [201, 409]);
  const created = registrations.find((response) => response.status === 201)!;
  users.push(created.body.id);
  await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(200);
  await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: password + 'extra' })
    .expect(401);
});
