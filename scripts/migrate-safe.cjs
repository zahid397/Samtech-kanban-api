'use strict';
// No reset, db push, or destructive SQL. Legacy baselining requires an exact diff.
const path = require('node:path');
const root = path.resolve(__dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const cli = require.resolve('prisma/build/index.js');
function prisma(args, quiet = false) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, env: process.env,
    stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 10_000_000,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
async function inspectHistory() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new PrismaClient();
  try {
    const tables = await db.$queryRaw`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
    `;
    const names = tables.map(row => row.table_name);
    let historyCount = 0;
    if (names.includes('_prisma_migrations')) {
      const rows = await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations"`;
      historyCount = rows[0].count;
    }
    if (historyCount) return 'migrate';
    if (!names.filter(name => name !== '_prisma_migrations').length) return 'migrate';
    // Use the datasource file rather than --from-url so the credential is not
    // copied into child process arguments. Prisma reads DATABASE_URL itself.
    const status = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/baseline.prisma', '--exit-code'], true);
    if (status !== 0) {
      throw new Error('Existing database does not exactly match the original Prisma schema, or the comparison failed. Back up and follow docs/MIGRATIONS.md; no baseline or reset was attempted.');
    }
    return 'baseline';
  } finally {
    await db.$disconnect();
  }
}
async function main() {
  try {
    const action = await inspectHistory();
    if (action === 'baseline') {
      console.log('Verified exact original Prisma schema; recording the existing baseline without recreating tables.');
      const code = prisma(['migrate', 'resolve', '--applied', '20260705000000_baseline']);
      if (code !== 0) { process.exitCode = code; return; }
    }
    process.exitCode = prisma(['migrate', 'deploy']);
  } catch (error) {
    // Upstream errors may contain connection details; keep logs non-sensitive.
    console.error(error?.message?.startsWith('Existing database') ? error.message : 'Migration startup check failed. Verify DATABASE_URL and database availability; no reset was attempted.');
    process.exitCode = 1;
  }
}
if (require.main === module) void main();
module.exports = { inspectHistory };
