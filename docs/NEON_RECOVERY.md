# Existing Neon project recovery

Audit date: 2026-10-22. These findings are from actual read-only Neon API and SQL calls, not assumed deployment success.

## Verified target

| Item | Verified value |
| --- | --- |
| Organization | `org-old-sunset-17748824` |
| Existing project | `summer-shape-79719316` (`Samer tech api`) |
| Production branch | `production` / `br-small-wave-az6lfkzw` |
| Region | `aws-ap-southeast-1` |
| Database | `neondb` |
| PostgreSQL | 18.6 |
| Project access | ADMIN through the connected Neon integration |
| Compute | Existing read-write endpoint active |
| SQL connectivity | `SELECT 1` returned `1` |

The initial public schema contains `users`, `boards`, `columns`, `tasks`, and `task_labels`. At the audit there was one existing user and no boards or tasks. There was no `_prisma_migrations` table. The application user and the separate `neon_auth` schema must be preserved.

The public columns, indexes, and foreign keys were inspected and correspond to the original Kanban layout. An exact Prisma schema comparison is still required before adopting the migration baseline. Database access alone does not establish that the Render service has the correct connection or that new migrations have been applied.

## Service status at audit

| Service | Actual finding | Application decision |
| --- | --- | --- |
| PostgreSQL | Connected; existing public application tables present | Keep Prisma and preserve existing rows. Use the reviewed migration guard after an exact comparison and backup. |
| Neon Auth | Existing managed Better Auth integration enabled; `neon_auth` tables present | Preserve it. Keep existing NestJS JWT/password authentication for this app; no identity migration or duplicate user system is required. |
| AI Gateway | API reports enabled and returns a branch endpoint; a default invocation credential exists | Gateway output has not been verified by this audit. Official docs require a paid Neon plan with prepaid credits, while this organization reports Free. Do not claim inference works or upgrade billing automatically. Lightweight Python remains available without a commercial key. |
| Object Storage | Enabled; existing bucket `zah` has `public_read` access | Preserve existing objects and bucket settings. This public bucket is unsuitable for private per-user attachments without a separate access-controlled design. No file migration was performed. |
| Functions | Function list empty | Existing NestJS/FastAPI services already serve the app. No function was deployed solely to duplicate those services. |

Endpoint discovery and credential metadata are not evidence of a successful model request or an authorized file upload. No credential values were printed by this audit, and no production service, schema, role, bucket or record was changed.

## CLI verification

Installed Neon CLI **8.10.3** in an isolated workspace tools directory:

```sh
npm install --prefix /workspace/.tools/neon-cli neon@latest --no-audit --no-fund
/workspace/.tools/neon-cli/node_modules/.bin/neon --version
```

This keeps CLI packages out of the application dependency manifests. A normal developer installation may use the requested `npm i -g neon@latest`, or invoke `npx neon@latest`.

The installed CLI supports `init`, `deploy`, `--org-id`, `--project-id`, `--branch`, and every requested service name: `postgres`, `auth`, `ai-gateway`, `object-storage`, and `functions`. It also supports safe linking with `--no-env-pull`, and `neon config plan` for a read-only deployment diff.

There is no local authenticated CLI profile: `neon profile list -o json` reports a missing DEFAULT credential file and no account, and `NEON_API_KEY` is absent. No unattended browser login was started. The connected MCP integration was used successfully instead. CLI initialization/deployment was not claimed successful.

If a human wants to operate the CLI in their own environment, authenticate first:

```sh
neon login
neon profile list -o json
```

Then link the **existing** project without overwriting local application environment files:

```sh
neon link --org-id org-old-sunset-17748824 \
  --project-id summer-shape-79719316 \
  --branch production --no-env-pull -y
```

The requested initialization syntax is supported, but should only be used after inspecting the working directory and current service configuration. `init` sets up the current directory in place and may install tooling/config dependencies and pull environment files. Existing services do not need to be recreated to repair the database connection.

If a reviewed `neon.ts` policy is later added, inspect its effects before applying it:

```sh
neon config plan --project-id summer-shape-79719316 --branch production
neon deploy --project-id summer-shape-79719316 --branch production --no-env-pull
```

Do not add `--update-existing`, `--allow-protected`, or `-y` to a production deploy without reviewing the corresponding changes. `neon deploy` provisions declared services; it does not migrate Prisma models or connect the existing NestJS application automatically.

## Database connection handling

Retrieve a connection for the verified project, branch, database and role through the Neon Console or an authenticated integration. Keep it in server-side secret storage. The verified database owner role is `neondb_owner`.

Use the appropriate pooled connection for application traffic and a direct connection for migration/introspection operations where required by the installed Prisma version and provider configuration. Preserve SSL parameters. Never copy a database URL into a `VITE_` variable, source file, command argument, issue body or log.

The checked-in project uses Prisma 5.22. Current Neon setup examples use newer Prisma majors; that does not justify replacing this working ORM version during recovery. Use its installed CLI and the project's reviewed migration helper.

## Official documentation checked

The documentation index and these current Markdown pages were fetched and read:

- [Neon CLI installation](https://neon.com/docs/cli/install)
- [Neon init](https://neon.com/docs/cli/init)
- [Neon deploy](https://neon.com/docs/cli/deploy)
- [Prisma connection guide](https://neon.com/docs/guides/prisma)
- [Connection pooling](https://neon.com/docs/connect/connection-pooling)
- [AI Gateway setup and plan requirements](https://neon.com/docs/ai-gateway/get-started)
- [Neon configuration](https://neon.com/docs/reference/neon-ts)
