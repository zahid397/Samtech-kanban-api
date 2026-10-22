# Unified local verification

Use a patched runtime from `.nvmrc`: **Node.js 24.22.1**. The supported alternative is Node.js 22.23.4 or a later patch in either supported major. Install dependencies before verification; the runner never changes dependency versions or installs a browser automatically.

```sh
nvm install
nvm use
npm ci
npm --prefix frontend ci
python3.12 -m venv ai-engine/.venv
ai-engine/.venv/bin/python -m pip install --require-hashes -r ai-engine/requirements-dev.lock
ai-engine/.venv/bin/python -m pip install --no-deps -e ./ai-engine
```

On Windows, create the virtual environment with `py -3.12 -m venv ai-engine/.venv` and use `ai-engine/.venv/Scripts/python.exe` for its installation commands. The runner discovers that executable automatically; `PYTHON` can select another prepared Python interpreter.

## Builds, static checks and unit tests

```sh
npm run verify
```

This generates Prisma Client, compiles NestJS, runs ESLint and backend unit tests, builds/type-checks React, runs Python tests, and audits both npm packages and the installed Python dependencies. It does not connect to a supplied production database, start application servers, install model weights or call a paid AI provider. Unit and Python commands receive generated test secrets and a limited environment rather than production API credentials.

## Full isolated database and browser workflow

First start an isolated PostgreSQL database named **`sammtech_test`** and set its connection as `DATABASE_URL` in the invoking terminal. Preserve TLS settings when your test database requires them. Never select a production database. The runner rejects a missing URL, a non-PostgreSQL URL, or any database name other than exactly `sammtech_test` **before executing checks**.

For example, with an existing disposable local test container:

```sh
export DATABASE_URL='postgresql://postgres:your-test-password@127.0.0.1:5433/sammtech_test'
npm run verify:all
```

PowerShell uses `$env:DATABASE_URL = 'postgresql://...'` instead of `export`. Do not paste database secrets into source files or commit environment files.

The full command runs every `verify` check, then safe migration startup, PostgreSQL integration tests and migration-preservation/drift scenarios. Those tests create only their own records/schemas and remove their own temporary schemas; the test database remains an explicitly disposable resource. It then starts these owned local services:

| Service | Local address |
| --- | --- |
| NestJS API | `http://127.0.0.1:5055` |
| FastAPI intelligence | `http://127.0.0.1:8055` |
| Vite frontend | `http://127.0.0.1:5175` |

The ports must be free; the runner refuses to stop an existing process to obtain them. Vite proxies requests to the managed API through `SAMMTECH_API_PROXY_TARGET`. Browser tests receive `E2E_BASE_URL` and `E2E_API_URL` for these servers, and generated shared service/JWT secrets connect the local components. The Python child receives no database, JWT, scheduler, Neon or commercial AI credentials.

The runner checks readiness before launching Playwright and stops its own processes in `finally` after success or failure. Interrupted runs send `SIGTERM`; a process that fails to stop within five seconds receives `SIGKILL`. A bounded service-output tail is shown only for diagnostics when verification fails. Production credentials and environment values are never dumped.

### Browser prerequisite

Playwright uses `CHROMIUM_PATH` when supplied; the existing Linux default is `/usr/bin/chromium`. If you use a Playwright-managed browser instead:

```sh
cd frontend
npx playwright install chromium
node -e "console.log(require('@playwright/test').chromium.executablePath())"
cd ..
export CHROMIUM_PATH='/path/printed/by/the/previous/command'
npm run verify:all
```

On Linux CI, `npx playwright install --with-deps chromium` also installs the browser's operating-system dependencies. Follow the existing CI workflow for that setup. Browser traces/screenshots remain ignored by Git; failed traces may contain test-session authorization data and should not be published casually.

## Individual commands and limits

Existing `npm test`, `npm run test:integration`, frontend `npm run test:e2e`, Python pytest and migration commands remain available. CI retains its existing explicit stages so a failed component is visible in GitHub Actions.

The browser suite exercises actual local API/Python/PostgreSQL operations. Mocked speech-device boundaries test control behavior and resource cleanup; they do not establish physical microphone, audible playback or Bengali recognition quality. Run real-device voice checks separately on supported browsers. Neither command deploys infrastructure, changes payment subscriptions, proves production health, or replaces a production migration review/backup.

Browser cases share one localhost address and keep the production authentication throttle enabled. A shared test fixture reserves a conservative 75-second budget before creating accounts/logging in. This can pause a case between authentication scenarios; individual UI actions still have a 15-second timeout. Speech device boundaries are explicitly simulated where noted; actual hardware audibility is a separate manual check.
