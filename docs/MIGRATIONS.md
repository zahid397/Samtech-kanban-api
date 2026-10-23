# Database upgrades without data loss

The repository now includes the original schema as migration `20260705000000_baseline`, followed by additive workspace and AI proposal migrations. The original repository had no migration history. An existing database must be backed up and inspected before applying this sequence. The startup helper can baseline only an exact match to `prisma/baseline.prisma`; it never guesses how to reconcile schema differences.

Never run `prisma migrate reset`, `prisma db push --accept-data-loss`, `DROP SCHEMA`, or force dependency upgrades to resolve a release problem.

## New empty PostgreSQL database

Set `DATABASE_URL` using a secret environment setting, then run from the repository root:

```sh
npm ci
node scripts/migrate-safe.cjs
npm run build
```

The helper checks schema metadata, then runs `prisma migrate deploy`. If an existing database has no migration history, the helper compares it against the original schema. It records the original baseline only when Prisma reports zero differences, then applies the additive migrations. It refuses every other untracked populated schema. A release backup is still required; this check does not replace one.

## Existing database with no migration history

1. Take a provider snapshot or verified `pg_dump` backup. Restore it to an isolated staging database and perform the following steps there first. Store backups securely; they contain user data.
2. Select the intended database by configuring `DATABASE_URL` locally or in the provider's secret settings. Do not paste its value into chat, shell logs, or Git.
3. Compare the live schema with the checked-in original schema:

   ```sh
   npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/baseline.prisma --exit-code
   ```

   Exit code `0` means no schema difference; code `2` means differences exist; code `1` indicates an error. Review differences before proceeding. Do not apply the diff output automatically. A database that already includes some new fields needs a specifically reviewed migration history, not a blanket baseline.
4. Only after confirming the original schema matches, mark the original migration as already applied:

   ```sh
   npx prisma migrate resolve --applied 20260705000000_baseline
   ```

   This records history; it does not run the baseline's table-creation SQL.
5. Run the additive migrations and verify the application:

   ```sh
   node scripts/migrate-safe.cjs
   npx prisma migrate status
   npm run build
   ```

6. Repeat the reviewed process against production during the planned release after verifying the backup and intended connection. Test login, board read, task creation, movement, and refresh persistence.

If `_prisma_migrations` already exists, inspect `prisma migrate status` and the actual history. Do not mark failed migrations resolved without understanding whether their SQL partially ran.

## What the workspace migration changes

It adds completion metadata, task estimates, checklists, comments, dependency edges, audit logs, agent executions, automation rules/history, text files, and AI proposals. It preserves users, boards, columns, tasks, labels, passwords, and IDs.

The workspace migration marks existing columns named `Done` as completed columns and fills completion timestamps from existing task update times. Those timestamps are historical approximations. It normalizes existing active task positions by their previous order, creation time, and ID to repair old gaps or duplicates. Review this backfill before production deployment.

Migrations are forward-only release steps. Rolling back application code does not roll back database changes. Keep the previous application compatible with the additive schema and restore a backup only through a separately reviewed recovery procedure.
