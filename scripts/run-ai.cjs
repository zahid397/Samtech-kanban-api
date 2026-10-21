'use strict';
const path = require('node:path');
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
try { process.loadEnvFile(path.join(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const port = Number(process.env.AI_PORT || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('AI_PORT must be 1–65535');
if ((process.env.AI_SERVICE_KEY || '').length < 32) throw new Error('Set AI_SERVICE_KEY in the local .env file first');
const python = path.join(root, 'ai-engine', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python)) throw new Error('Create ai-engine/.venv and install ai-engine dependencies first');
const env = { ...process.env };
for (const key of ['DATABASE_URL', 'JWT_SECRET', 'SCHEDULER_SECRET', 'POSTGRES_PASSWORD']) delete env[key];
const child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: path.join(root, 'ai-engine'), env, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Could not start the local Python service. Check the virtual environment installation.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
