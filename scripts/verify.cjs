'use strict';

// Runs the existing checks without installing packages or reading a production .env.
// All child environments are explicit, so Python/browser checks do not inherit secrets.
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { existsSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');
const engine = path.join(root, 'ai-engine');
const children = new Set();
const services = [];
const args = process.argv.slice(2);
const integration = args.includes('--integration');
const ports = { api: 5055, python: 8055, frontend: 5175 };
const origins = {
  api: `http://127.0.0.1:${ports.api}`,
  python: `http://127.0.0.1:${ports.python}`,
  frontend: `http://127.0.0.1:${ports.frontend}`,
};
const allowedEnvKeys = [
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'TERM',
  'CI', 'NO_COLOR', 'FORCE_COLOR', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
  'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
  'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'PIP_CERT',
];
const baseEnv = Object.fromEntries(
  allowedEnvKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
);
const secrets = {
  JWT_SECRET: randomBytes(36).toString('base64url'),
  AI_SERVICE_KEY: randomBytes(36).toString('base64url'),
  SCHEDULER_SECRET: randomBytes(36).toString('base64url'),
};
const testEnv = {
  ...baseEnv,
  ...secrets,
  NODE_ENV: 'test',
  // An unexpected DB access in a unit test must fail locally, never inherit .env.
  DATABASE_URL: 'postgresql://verification:unused@127.0.0.1:1/sammtech_test?connect_timeout=1',
  PORT: String(ports.api),
  AI_ENGINE_URL: origins.python,
  CORS_ORIGIN: `${origins.frontend},http://localhost:${ports.frontend}`,
  TRUST_PROXY_HOPS: '0',
  AUTOMATION_WORKER_ENABLED: 'false',
  OMP_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
};
const pythonEnv = {
  ...baseEnv,
  AI_SERVICE_KEY: secrets.AI_SERVICE_KEY,
  AI_PROVIDER: 'lightweight',
  OMP_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
  MKL_NUM_THREADS: '1',
  HF_HUB_OFFLINE: '1',
  TRANSFORMERS_OFFLINE: '1',
};

function validateRuntime() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const patched = (major === 22 && (minor > 23 || (minor === 23 && patch >= 4)))
    || (major === 24 && (minor > 22 || (minor === 22 && patch >= 1)));
  if (!patched) throw new Error('Use the patched Node.js version in .nvmrc before running verification.');
}

function isolatedDatabase() {
  let url;
  try { url = new URL(process.env.DATABASE_URL || ''); } catch {
    throw new Error('Full verification requires DATABASE_URL for an isolated database named sammtech_test.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.pathname !== '/sammtech_test') {
    throw new Error('Refusing database verification: DATABASE_URL must select the isolated sammtech_test database.');
  }
  return url.toString();
}

function pythonExecutable() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const local = path.join(engine, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3';
}

function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  ];
  const cli = candidates.find((candidate) => candidate && existsSync(candidate) && /\.(c?js)$/.test(candidate));
  if (!cli) throw new Error('Cannot locate npm CLI. Start this runner with npm run verify or npm run verify:all.');
  return cli;
}

function trackedSpawn(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    cwd: root,
    env: testEnv,
    stdio: 'inherit',
    // Own process groups let cleanup stop npm's descendants as well as its parent.
    detached: process.platform !== 'win32',
    ...options,
  });
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}

function run(label, command, commandArgs, options = {}) {
  console.log(`\n[verify] ${label}`);
  const child = trackedSpawn(command, commandArgs, options);
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`${label} could not start; check the documented prerequisites.`)));
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed (${signal || code || 'unknown exit'}).`));
    });
  });
}

function runNpm(label, commandArgs) {
  return run(label, process.execPath, [npmCli(), ...commandArgs]);
}

async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Local verification port ${port} is already in use; existing services were not stopped.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function startService(name, command, commandArgs, options = {}) {
  const child = trackedSpawn(command, commandArgs, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  const service = { name, child, tail: '', error: false };
  // Keep only a bounded diagnostic tail; do not retain request recordings or auth state.
  const record = (chunk) => { service.tail = (service.tail + chunk.toString()).slice(-32000); };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  child.on('error', () => { service.error = true; });
  services.push(service);
  return service;
}

async function ready(service, url) {
  const until = Date.now() + 60000;
  while (Date.now() < until) {
    if (service.error || service.child.exitCode !== null || service.child.signalCode !== null) {
      throw new Error(`${service.name} stopped before becoming ready.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      const ok = response.ok;
      await response.body?.cancel();
      if (ok) { console.log(`[verify] ${service.name} ready`); return; }
    } catch { /* bounded polling while the owned local service starts */ }
    await delay(300);
  }
  throw new Error(`${service.name} did not become ready within 60 seconds.`);
}

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const signal = (name) => {
    try {
      if (process.platform === 'win32') child.kill(name);
      else process.kill(-child.pid, name);
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signal('SIGTERM');
  let timer;
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => { timer = setTimeout(resolve, 5000); }),
  ]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) signal('SIGKILL');
}

async function cleanup() {
  await Promise.allSettled([...children].map(stopChild));
}

function diagnostics() {
  const sensitive = [...Object.values(secrets), testEnv.DATABASE_URL].filter(Boolean);
  for (const service of services) {
    if (!service.tail.trim()) continue;
    let tail = service.tail.slice(-4000);
    for (const value of sensitive) tail = tail.split(value).join('[redacted test configuration]');
    console.error(`\n[verify] ${service.name} diagnostic tail\n${tail}`);
  }
}

async function main() {
  if (args.includes('--help')) {
    console.log('npm run verify       Builds, lint, unit/Python tests and dependency audits.\nnpm run verify:all   Also requires isolated DATABASE_URL, runs migrations/database tests and managed local browser tests.\nSee docs/TESTING.md for installation and browser prerequisites.');
    return;
  }
  if (args.some((arg) => arg !== '--integration')) throw new Error('Unknown verification option. Use --help.');
  validateRuntime();
  // Reject an unsafe URL before executing any command, not just before migration.
  if (integration) testEnv.DATABASE_URL = isolatedDatabase();
  console.log(`[verify] Node.js ${process.version}; ${integration ? 'isolated full verification' : 'build and unit verification'}`);
  const python = pythonExecutable();
  await runNpm('Generate Prisma Client', ['run', 'prisma:generate']);
  await runNpm('Backend production build', ['run', 'build']);
  await runNpm('Backend lint', ['run', 'lint']);
  await runNpm('Backend unit tests', ['test']);
  await runNpm('Frontend TypeScript and production build', ['--prefix', 'frontend', 'run', 'build']);
  await run('Python intelligence tests', python, ['-m', 'pytest', 'tests', '-q'], { cwd: engine, env: pythonEnv });
  await runNpm('Backend dependency audit', ['audit']);
  await runNpm('Frontend dependency audit', ['--prefix', 'frontend', 'audit']);
  await run('Python dependency audit', python, ['-m', 'pip_audit', '--skip-editable'], { cwd: engine, env: pythonEnv });
  if (integration) {
    await run('Safe migrations on isolated test database', process.execPath, ['scripts/migrate-safe.cjs']);
    await runNpm('PostgreSQL integration tests', ['run', 'test:integration']);
    await run('Migration preservation and drift guards', process.execPath, ['scripts/verify-migrations.cjs']);
    for (const port of Object.values(ports)) await freePort(port);
    const api = startService('NestJS API', process.execPath, ['dist/main.js']);
    const ai = startService('Python intelligence', python,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(ports.python)],
      { cwd: engine, env: pythonEnv });
    const ui = startService('Vite frontend', process.execPath,
      [path.join(frontend, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(ports.frontend), '--strictPort'],
      { cwd: frontend, env: { ...baseEnv, SAMMTECH_API_PROXY_TARGET: origins.api } });
    await Promise.all([
      ready(api, `${origins.api}/health/ready`),
      ready(ai, `${origins.python}/health`),
      ready(ui, `${origins.frontend}/`),
    ]);
    const browserEnv = {
      ...baseEnv,
      E2E_BASE_URL: origins.frontend,
      E2E_API_URL: origins.api,
      ...(process.env.CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.CHROMIUM_PATH } : {}),
    };
    await run('Browser acceptance tests', process.execPath,
      [npmCli(), '--prefix', 'frontend', 'run', 'test:e2e'], { env: browserEnv });
  }
  console.log('\n[verify] All requested checks passed. Local checks do not establish production deployment health.');
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => { void cleanup().finally(() => process.exit(code)); });
}

main().catch((error) => {
  console.error(`[verify] ${error.message}`);
  diagnostics();
  process.exitCode = 1;
}).finally(cleanup);
