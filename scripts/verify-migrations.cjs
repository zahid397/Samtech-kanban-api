'use strict';
// Integration verification creates and removes only schemas it owns in sammtech_test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const connection = new URL(process.env.DATABASE_URL || '');
if (connection.pathname !== '/sammtech_test') throw new Error('Migration verification requires the isolated sammtech_test database');
const admin = new PrismaClient();
const schemas = [];
async function database(label) {
  const schema = `verify_migration_${label}_${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
  assert.match(schema, /^verify_migration_[a-z0-9_]+$/);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  schemas.push(schema);
  const url = new URL(connection); url.searchParams.set('schema', schema);
  return { url: url.toString(), db: new PrismaClient({ datasources: { db: { url: url.toString() } } }) };
}
function run(url) {
  return spawnSync(process.execPath, ['scripts/migrate-safe.cjs'], {
    cwd: root, env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe', encoding: 'utf8', timeout: 60000,
  });
}
async function original(db) {
  const sql = fs.readFileSync(path.join(root, 'prisma/migrations/20260705000000_baseline/migration.sql'), 'utf8');
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  const user = await db.user.create({ data: { name: 'Preserved user', email: 'migration@example.test', password: 'not-a-real-login' } });
  const board = await db.board.create({ data: { title: 'Preserved board', userId: user.id } });
  // Current Prisma models include new fields; raw inserts target the old schema.
  await db.$executeRaw`INSERT INTO columns (id,title,"order","boardId","updatedAt") VALUES ('existing-column','Done',0,${board.id},NOW())`;
  await db.$executeRaw`INSERT INTO tasks (id,title,"columnId",position,"updatedAt") VALUES ('existing-task','Preserve this task','existing-column',4,NOW())`;
  return user.id;
}
async function main() {
  try {
    const fresh = await database('fresh');
    try {
      assert.equal(run(fresh.url).status, 0, 'Fresh database migrates');
      assert.equal(await fresh.db.user.count(), 0);
      console.log('PASS: empty database migrated');
    } finally { await fresh.db.$disconnect(); }

    const legacy = await database('legacy');
    try {
      const id = await original(legacy.db);
      assert.equal(run(legacy.url).status, 0, 'Exact original schema can baseline');
      assert.equal((await legacy.db.user.findUnique({where:{id}})).name, 'Preserved user');
      const task = await legacy.db.task.findUnique({where:{id:'existing-task'}});
      assert.equal(task.title, 'Preserve this task');
      assert.equal(task.position, 0);
      assert.ok(task.completedAt);
      console.log('PASS: exact legacy baseline retained existing users and tasks');
    } finally { await legacy.db.$disconnect(); }

    const drift = await database('drift');
    try {
      const id = await original(drift.db);
      await drift.db.$executeRawUnsafe('CREATE TABLE unexpected_drift (id integer PRIMARY KEY)');
      assert.notEqual(run(drift.url).status, 0, 'Unknown schema must be refused');
      assert.equal((await drift.db.user.findUnique({where:{id}})).name, 'Preserved user');
      const rows = await drift.db.$queryRaw`SELECT title,position FROM tasks WHERE id='existing-task'`;
      assert.equal(rows[0].position, 4);
      const history = await drift.db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='_prisma_migrations'`;
      assert.equal(history.length, 0, 'Refused database must not be marked baselined');
      console.log('PASS: schema drift refused without mutating user data or migration history');
    } finally { await drift.db.$disconnect(); }
  } finally {
    for (const schema of schemas) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  }
}
main().catch(() => { console.error('Migration verification failed; inspect the isolated test database. No production database was selected.');process.exitCode=1; });
