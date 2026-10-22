# Vercel frontend and Render services

## Targets and release boundaries

The existing API is `Samtech-kanban-api`, service ID `srv-d94thckvikkc73cvmmv0`, in the user-confirmed Render workspace `tea-d463nrn5r7bs73au4et0` (My Workspace), region `virginia`. Its public origin is `https://samtech-kanban-api.onrender.com`. These identify the intended resource; they do not assert that the current release is healthy.

The initial inspection found incompatible NestJS major versions, an install command that continued after failure, and no checked-in Prisma migrations. No Render-managed PostgreSQL instance was visible in that workspace. The API may use an external database; preserve its configured connection and investigate the provider before changing it.

No resource creation, paid upgrade or database replacement is implied by this file. Review the final deployment result separately. Local changes must be committed and pushed before Render's Git deployment can build them.

## Vercel: frontend

Current verified frontend: https://sammtech-ai-os.vercel.app (`READY`, deployment `dpl_6K6wDmK9b4EerGHnrvu45xwFi8np`). It was uploaded directly from local commit `b1149b1cbb2be286484dd4bc60d1812be637eecd` because GitHub write requests returned HTTP 403. The production API/database remains unavailable; see [implementation report](IMPLEMENTATION_REPORT.md). Add `https://sammtech-ai-os.vercel.app` to API CORS when restoring the backend.

1. Import `zahid397/Samtech-kanban-api` into the intended Vercel account/team, or update its existing matching project.
2. Set **Root Directory** to `frontend`, **Framework Preset** to Vite, **Node.js** to 22.x, **Install Command** to `npm ci`, **Build Command** to `npm run build`, and **Output Directory** to `dist`. Root Directory is a project setting, not a `vercel.json` field.
3. Set `VITE_API_URL=https://samtech-kanban-api.onrender.com` in the intended preview/production environment before building. It is public frontend configuration. Never set `JWT_SECRET`, `DATABASE_URL`, `AI_SERVICE_KEY` or `SCHEDULER_SECRET` as `VITE_` variables.
4. Add the exact frontend origin, without a trailing slash, to the API's comma-separated `CORS_ORIGIN`. Add specific preview origins deliberately; wildcard CORS origins are rejected.
5. Build and inspect the resulting deployment. Verify HTTPS, login, board loading, draft approval, task persistence after refresh, microphone permissions, and mobile navigation before reporting the full application live.

`frontend/vercel.json` supplies SPA rewrites, static asset caching, content-type protection, a microphone permission policy, frame protection and a Content Security Policy. The policy allows connections to the app itself and `https://*.onrender.com`. If the API uses a custom hostname or a different provider, add that exact API origin to `connect-src` before deployment. Local Vite development does not use these hosted headers.

For CLI deployment, run from `frontend` after authenticating through the supported Vercel CLI flow and verifying the intended project/team. Do not pass tokens on the command line or copy secret-bearing `.vercel` files into artifacts. Git integration is sufficient for automatic preview builds; the repository's test CI does not contain a deployment token.

## Render: NestJS API

The Blueprint keeps the existing service name and region. Before syncing it, verify it maps to the service ID above; changing names or regions can create a new service instead of updating the intended one.

| Setting | Value |
| --- | --- |
| Root Directory | repository root |
| Runtime / Node | Node.js / 22 |
| Build | `npm ci --include=dev && npm run build` |
| Start | `node scripts/migrate-safe.cjs && node dist/main.js` |
| Health check | `/health/ready` |
| Bind | application uses `0.0.0.0:$PORT` |

The `&&` build stops on installation failure. Development dependencies are explicitly included because TypeScript and Prisma CLI are needed during release. The free service has no pre-deploy step, so the reviewed migration helper runs before startup. For a paid always-on release, a pre-deploy migration job can be used instead, retaining the same safety guard.

Required settings:

- `DATABASE_URL`: preserve the intended PostgreSQL connection, its TLS settings and correct schema. For a same-region Render database, prefer its internal URL; for an external provider, use its supported direct/pooled connection configuration. Prisma uses a connection pool, so fit `connection_limit` and total replicas to the provider's limits.
- `JWT_SECRET`: at least 32 random characters. Keep the existing value unless intentionally invalidating current sessions. `generateValue` preserves an already configured value during Blueprint sync.
- `JWT_TTL_SECONDS`: validated lifetime, default 86400. It replaces the old `JWT_EXPIRES_IN` string setting.
- `CORS_ORIGIN`: exact trusted frontend origins separated by commas, no wildcard or trailing slash.
- `TRUST_PROXY_HOPS`: use 1 only for the known direct Render proxy path; local direct access uses 0. Re-evaluate it if introducing another proxy.
- `AI_ENGINE_URL`: full reachable Python service origin, such as its assigned HTTPS `onrender.com` URL. A Render service cannot reach an AI server on the user's `localhost`.
- `AI_SERVICE_KEY`: same private service key as Python. The Blueprint reads it from the Python service; never expose it to browsers.
- `AUTOMATION_WORKER_ENABLED=true`: evaluates due rules every minute while this process is awake. For an external-only scheduler, set it to `false`.
- `SCHEDULER_SECRET`: a separate random secret of at least 32 characters for the internal scheduling endpoint.

Do not run migrations against an unknown live database. Take a backup, inspect [MIGRATIONS.md](MIGRATIONS.md), and test a restored copy. The helper records an original baseline only after a zero-difference Prisma comparison. Unknown drift stops startup and prints safe instructions.

For existing services, Blueprint `sync: false` does not update values on later syncs. Set missing/changed values through the intended Dashboard environment settings, preserve unrelated values, and deploy to activate them. A Blueprint sync can later override Blueprint-managed values, so keep `render.yaml` as the shared non-secret source of truth.

## Render: Python lightweight service

| Setting | Value |
| --- | --- |
| Root Directory | `ai-engine` |
| Runtime | Python 3.12 |
| Build | `pip install --require-hashes -r requirements.lock && pip install --no-deps .` |
| Start | `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health check | `/health` |
| Shared secret | `AI_SERVICE_KEY`, minimum 32 random characters |

Only the API gateway calls inference and local voice routes; Python has no database credentials and cannot create tasks. The public health route reports service availability. Do not enable public FastAPI documentation or expose the service key. Restrict network access further on supported paid private-service infrastructure when appropriate.

The lightweight deployment needs NumPy/scikit-learn and does not install or download an LLM, embeddings, Whisper or Piper. Start with a representative workload and measure memory before relying on a 512 MB free instance. The free allocation has very limited CPU and RAM. If imports or requests exceed its allowance, keep Python on local hardware or choose a suitable always-on compute plan through an explicit hosting decision.

## Scheduling

The API can evaluate due rules from the application, its in-process timer, or `POST /internal/automations/tick` authenticated with `Authorization: Bearer <SCHEDULER_SECRET>`. Configure that secret through the scheduler provider's secret storage. Do not put it in a public URL, repository, log, or frontend bundle.

Rules and execution history are stored in PostgreSQL. Owner transaction locks and per-schedule execution records protect processing across overlapping requests. The scheduler coalesces missed intervals after downtime; it does not create an unbounded backlog. Reports stay in the workspace; no external notifications are sent.

The in-process timer cannot run while Render sleeps. For reliable daily/weekly timing, use an always-on API/worker or a trustworthy external authenticated scheduler. An external call may wake a free API but still incurs its cold-start delay; this is not a 24/7 timing guarantee.

## Render free limits and durability

Provider docs retrieved during this implementation state that free web services spin down after 15 minutes without inbound traffic, cold starts can take about one minute, free instances share 750 hours per workspace per month, and their filesystems are ephemeral. These limits are shared with other services in the workspace. Optional model files cannot be relied upon on free ephemeral compute.

Free Render PostgreSQL expires 30 days after creation and does not provide managed backups. Do not treat it as durable production storage. This Blueprint deliberately leaves PostgreSQL provisioning out to preserve the existing data source. Maintain backups with the actual database provider.

Current references: [Blueprint specification](https://render.com/docs/blueprint-spec), [environment variables](https://render.com/docs/configure-environment-variables), [deployment lifecycle](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [free instances](https://render.com/docs/free), [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite).

## Release verification

1. Check local builds, backend/Python tests, isolated PostgreSQL migration tests and browser acceptance results.
2. Capture the exact source commit and deploy ID for each service.
3. Monitor each deployment to a terminal live/ready status. An accepted deploy trigger is not success.
4. Check API `/health/ready`, Python `/health`, and authenticated `/workspace/health`.
5. Register/login through the deployed frontend, approve a task, refresh, and verify the stored task and audit event.
6. Review runtime logs for errors and verify the exact frontend origin passes CORS.

If the API/database is unavailable, report the frontend deployment separately. Do not label the entire acceptance workflow live based solely on a Vercel static build.
