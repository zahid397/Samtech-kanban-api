import 'reflect-metadata';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TasksService } from '../../src/tasks/tasks.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
let app: INestApplication, db: PrismaService, tasks: TasksService;
const users: string[] = [];
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
  tasks = app.get(TasksService);
});
after(async () => {
  if (db) await db.user.deleteMany({ where: { id: { in: users } } });
  await app?.close();
});
test('real PostgreSQL: login, ownership, concurrency, moves, deletion, audit and persistence', async () => {
  const email = `acceptance-${Date.now()}@example.test`;
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Acceptance User', email, password: 'Local-test-pass123' })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: email.toUpperCase(), password: 'Local-test-pass123' })
    .expect(200);
  const token = login.body.accessToken;
  users.push(login.body.user.id);
  const uid = users[0];
  const board = await request(app.getHttpServer())
    .post('/boards')
    .auth(token, { type: 'bearer' })
    .send({ title: 'Acceptance workspace' })
    .expect(201);
  assert.equal(board.body.columns.length, 5);
  const [todo, next] = board.body.columns;
  await request(app.getHttpServer()).get(`/boards/${board.body.id}`).expect(401);
  const outsider = await db.user.create({
    data: { email: `outsider-${Date.now()}@example.test`, name: 'Other', password: 'unused' },
  });
  users.push(outsider.id);
  const outsiderToken = await app
    .get(JwtService)
    .signAsync({ sub: outsider.id, email: outsider.email });
  await request(app.getHttpServer())
    .patch(`/boards/${board.body.id}`)
    .send({ title: 'Unauthenticated rename' })
    .expect(401);
  await request(app.getHttpServer())
    .patch(`/boards/${board.body.id}`)
    .auth(outsiderToken, { type: 'bearer' })
    .send({ title: 'Unauthorized rename' })
    .expect(403);
  for (const title of ['', '   ', 'x'.repeat(121), null, 123]) {
    await request(app.getHttpServer())
      .patch(`/boards/${board.body.id}`)
      .auth(token, { type: 'bearer' })
      .send({ title })
      .expect(400);
  }
  await request(app.getHttpServer())
    .patch(`/boards/${board.body.id}`)
    .auth(token, { type: 'bearer' })
    .send({ title: 'Ownership change attempt', userId: outsider.id })
    .expect(400);
  const renamed = await request(app.getHttpServer())
    .patch(`/boards/${board.body.id}`)
    .auth(token, { type: 'bearer' })
    .send({ title: '  Renamed acceptance workspace  ' })
    .expect(200);
  assert.equal(renamed.body.title, 'Renamed acceptance workspace');
  assert.equal(renamed.body.userId, uid);
  assert.equal(
    await db.auditLog.count({
      where: { userId: uid, entityId: board.body.id, action: 'board.updated' },
    }),
    1,
  );
  const created = await Promise.all(
    Array.from({ length: 12 }, (_, i) => tasks.create(uid, todo.id, { title: `Task ${i}` })),
  );
  let rows = await db.task.findMany({
    where: { columnId: todo.id, deletedAt: null },
    orderBy: { position: 'asc' },
  });
  assert.deepEqual(
    rows.map((t) => t.position),
    Array.from({ length: 12 }, (_, i) => i),
  );
  await assert.rejects(
    tasks.move(outsider.id, created[0].id, { targetColumnId: next.id, newPosition: 0 }),
  );
  await Promise.all(
    created
      .slice(0, 6)
      .map((t) => tasks.move(uid, t.id, { targetColumnId: next.id, newPosition: 0 })),
  );
  await tasks.remove(uid, created[8].id);
  for (const col of [todo, next]) {
    rows = await db.task.findMany({
      where: { columnId: col.id, deletedAt: null },
      orderBy: { position: 'asc' },
    });
    assert.deepEqual(
      rows.map((t) => t.position),
      rows.map((_, i) => i),
    );
  }
  const archived = await request(app.getHttpServer())
    .get('/tasks/archived')
    .auth(token, { type: 'bearer' })
    .expect(200);
  assert.equal(
    archived.body.some((t: any) => t.id === created[8].id),
    true,
  );
  await assert.rejects(tasks.restore(outsider.id, created[8].id));
  await Promise.all([tasks.restore(uid, created[8].id), tasks.restore(uid, created[8].id)]);
  rows = await db.task.findMany({
    where: { columnId: todo.id, deletedAt: null },
    orderBy: { position: 'asc' },
  });
  assert.deepEqual(
    rows.map((t) => t.position),
    rows.map((_, i) => i),
  );
  assert.equal(
    await db.auditLog.count({
      where: { userId: uid, entityId: created[8].id, action: 'task.restored' },
    }),
    1,
  );
  await tasks.remove(uid, created[8].id);
  await request(app.getHttpServer())
    .patch(`/tasks/${created[6].id}`)
    .auth(token, { type: 'bearer' })
    .send({ position: 999 })
    .expect(400);
  await tasks.dependency(uid, created[1].id, created[2].id);
  await assert.rejects(tasks.dependency(uid, created[2].id, created[1].id));
  const fresh = await request(app.getHttpServer())
    .get(`/boards/${board.body.id}`)
    .auth(token, { type: 'bearer' })
    .expect(200);
  assert.equal(fresh.body.columns.flatMap((c: any) => c.tasks).length, 11);
  assert.equal(fresh.body.title, 'Renamed acceptance workspace');
  assert.equal(await db.auditLog.count({ where: { userId: uid, action: 'task.created' } }), 12);
  await request(app.getHttpServer())
    .delete(`/boards/${board.body.id}`)
    .auth(token, { type: 'bearer' })
    .expect(200);
  await request(app.getHttpServer())
    .patch(`/boards/${board.body.id}`)
    .auth(token, { type: 'bearer' })
    .send({ title: 'Cannot revive a deleted board' })
    .expect(404);
  await assert.rejects(tasks.move(uid, created[0].id, { targetColumnId: todo.id, newPosition: 0 }));
});
