# SammTech Kanban Task Management API

A RESTful backend for a Kanban-style task management system, built for the **SammTech Ltd. Backend Internship take-home assignment**. Users can register, log in, create boards, organize columns, and manage tasks — including dragging tasks between columns with a fully transactional position/reorder engine.

---

## 1. Tech Stack

| Layer          | Choice                                   |
|----------------|-------------------------------------------|
| Framework      | NestJS 10 (TypeScript)                    |
| Database       | PostgreSQL                                |
| ORM            | Prisma 5                                  |
| Auth           | JWT (Passport) + bcryptjs password hashing |
| Validation     | class-validator / class-transformer       |
| Docs           | Swagger / OpenAPI (`@nestjs/swagger`)     |
| Security       | Helmet, CORS, `@nestjs/throttler` rate limiting |

## 2. Features

- Register / login with hashed passwords and JWT access tokens
- Boards → Columns → Tasks hierarchy, scoped strictly to the owning user
- New boards auto-seed the 5 standard columns (Backlog, Todo, In Progress, Review, Done)
- Soft delete for boards and tasks (`deletedAt`), hard delete for columns
- Transactional task move/reorder endpoint (same-column reorder or cross-column transfer)
- Search tasks by title, filter by priority and due date
- Ownership enforcement on every mutation (`403` vs `404` handled distinctly)
- Global validation, consistent JSON error shape, Helmet, CORS, and rate-limited auth routes
- Full Swagger docs with bearer-token auth at `/api/docs`

## 3. Folder Structure

```
sammtech-kanban-api/
├── prisma/
│   ├── schema.prisma        # User, Board, Column, Task, TaskLabel + Priority enum
│   └── seed.ts              # optional demo data
├── src/
│   ├── auth/                # register, login, JWT strategy/guard
│   │   ├── dto/
│   │   ├── guards/
│   │   └── strategies/
│   ├── users/                # internal user data access (no public routes)
│   ├── boards/                # board CRUD + default column seeding
│   ├── columns/              # column CRUD
│   ├── tasks/                # task CRUD + move/reorder engine
│   ├── prisma/                # PrismaService/PrismaModule (global)
│   ├── common/
│   │   ├── decorators/       # @CurrentUser()
│   │   ├── filters/          # global HTTP exception filter
│   │   └── types/             # JwtPayload / AuthenticatedUser
│   ├── app.module.ts
│   ├── app.controller.ts     # GET / health check
│   └── main.ts               # bootstrap: helmet, CORS, validation, Swagger
├── .env.example
├── render.yaml
└── package.json
```

## 4. Environment Variables

Copy `.env.example` to `.env` and fill in real values — **never commit `.env`**.

| Variable          | Example                                                        | Notes                          |
|-------------------|-----------------------------------------------------------------|---------------------------------|
| `DATABASE_URL`    | `postgresql://username:password@localhost:5432/kanban_db`      | Your PostgreSQL connection string |
| `JWT_SECRET`      | `your_jwt_secret_here`                                          | Use a long random string in production |
| `JWT_EXPIRES_IN`  | `1d`                                                             | Any `ms`-compatible duration string |
| `PORT`            | `5000`                                                           | Local port |
| `NODE_ENV`        | `development`                                                    | `development` \| `production` |
| `CORS_ORIGIN`     | `*`                                                               | Restrict to your frontend origin in production |

## 5. Setup & Run Locally

```bash
# 1. Install dependencies (this also runs `prisma generate` via postinstall)
npm install

# 2. Configure environment
cp .env.example .env
# edit .env with your real DATABASE_URL and a strong JWT_SECRET

# 3. Run database migrations (creates tables from schema.prisma)
npm run prisma:migrate
# → prompts you to name the migration, e.g. "init"

# 4. (Optional) seed demo data — demo@sammtech.dev / Password123
npm run seed

# 5. Start the dev server (watch mode)
npm run start:dev
```

The API listens on `http://localhost:5000` (or your `PORT`). Health check: `GET /`.

### Other useful scripts

| Script                  | Purpose                                    |
|--------------------------|---------------------------------------------|
| `npm run build`          | Compile TypeScript to `dist/`               |
| `npm run start:prod`     | Run the compiled build (`dist/main.js`)     |
| `npm run prisma:studio`  | Open Prisma Studio (visual DB browser)      |
| `npm run prisma:deploy`  | Apply migrations in production (no prompts) |
| `npm run lint`           | ESLint with auto-fix                        |

## 6. Swagger Docs

Once running, open:

```
http://localhost:5000/api/docs
```

Click **Authorize**, paste a JWT from `POST /auth/login` (no `Bearer ` prefix needed — Swagger adds it), and every protected route becomes callable from the browser.

## 7. API Endpoints

**Auth**
| Method | Path             | Auth | Notes                        |
|--------|------------------|------|-------------------------------|
| POST   | `/auth/register` | —    | Create a user                |
| POST   | `/auth/login`    | —    | Returns `{ accessToken, user }` |

**Boards**
| Method | Path           | Auth | Notes                                   |
|--------|----------------|------|-------------------------------------------|
| POST   | `/boards`      | ✅   | Creates board + 5 default columns        |
| GET    | `/boards`      | ✅   | All boards owned by the caller           |
| GET    | `/boards/:id`  | ✅   | Board with columns + tasks. Supports `?search=&priority=&dueDate=` |
| DELETE | `/boards/:id`  | ✅   | Soft delete                              |

**Columns**
| Method | Path                        | Auth | Notes                |
|--------|------------------------------|------|-----------------------|
| POST   | `/boards/:boardId/columns`  | ✅   | Create column         |
| PATCH  | `/columns/:id`               | ✅   | Update title / order  |
| DELETE | `/columns/:id`               | ✅   | Hard delete (cascades to tasks) |

**Tasks**
| Method | Path                       | Auth | Notes                                             |
|--------|-----------------------------|------|-----------------------------------------------------|
| POST   | `/columns/:columnId/tasks` | ✅   | Create task                                        |
| PATCH  | `/tasks/:id`                | ✅   | Update title/description/priority/dueDate/assignee |
| DELETE | `/tasks/:id`                | ✅   | Soft delete                                        |
| PATCH  | `/tasks/:id/position`       | ✅   | Move within/between columns — see below            |

`PATCH /tasks/:id/position` body:
```json
{ "targetColumnId": "uuid-of-column", "newPosition": 1 }
```
Pass the task's **current** column id to just reorder within the same column.

All protected routes require `Authorization: Bearer <token>`. Unauthorized → `401`. Wrong owner → `403`. Missing resource → `404`.

## 8. Key Technical Decisions

- **Default columns on board creation.** Every new board is seeded with Backlog / Todo / In Progress / Review / Done, matching the assignment's example columns, so a board is immediately usable without a separate setup step.
- **Position as contiguous integers, not fractional keys.** Each column's tasks are numbered `0, 1, 2, …` with no gaps. Moving a task shifts every task between its old and new slot by one, inside a single Prisma interactive transaction (`$transaction`). This is simpler to reason about, debug, and display than fractional/sparse ordering, and for realistic column sizes the extra row updates are negligible. The whole shift-and-move sequence is atomic, so a failure mid-operation can't leave two tasks sharing a position.
- **One endpoint owns position changes.** `PATCH /tasks/:id` intentionally excludes `columnId`/`position` — all column and ordering changes go through `PATCH /tasks/:id/position`. This keeps position bookkeeping in exactly one code path instead of two endpoints that could disagree.
- **404 vs 403 is deliberate.** Every ownership check first looks the resource up by ID alone (→ `404` if it truly doesn't exist), then separately checks `board.userId === currentUser` (→ `403` if it exists but isn't theirs). This matches the assignment's explicit requirement to distinguish the two cases rather than returning `404` for both.
- **Columns are hard-deleted; their tasks cascade with them.** Boards and tasks use soft delete (`deletedAt`) per the spec, but columns have no `deletedAt` field — deleting a column is permanent and (via the Prisma schema's `onDelete: Cascade`) removes its tasks too. The trade-off is documented here rather than silently relying on schema behavior: if you need to preserve a column's tasks, move them to another column first.
- **`TaskLabel` is schema-only in this submission.** The model and relation exist (per the schema hint) so tasks can carry labels, but no dedicated label CRUD endpoints were built, since none were listed in the required endpoint list — see "What I'd improve" below.
- **`bcryptjs` instead of `bcrypt`.** `bcryptjs` is a pure-JavaScript implementation with an identical API, so there's no native module to compile — one less thing that can break across different deployment environments (this was actually discovered the hard way while sandbox-testing this very build; see Challenges below).

## 9. Challenges & How They Were Solved

- **Reordering without corrupting positions.** The trickiest part of the spec. Solved by treating each column's task list as a contiguous `0..n-1` sequence and wrapping every shift + the final move inside one `prisma.$transaction`, so partial failures can't desync positions. Both the same-column and cross-column cases clamp the requested position into the valid range first.
- **Distinguishing "not found" from "not yours."** Needed explicit two-step checks (fetch by ID, then compare `userId`) in every service, rather than folding the owner check into the `WHERE` clause, so `403` and `404` stay distinguishable as required.
- **Native dependency build failures.** `bcrypt`'s native binding failed to compile in a restricted-network environment. Swapped to `bcryptjs`, which needs no compilation step at all — a safer default for varied hosting environments, including some free-tier build containers.
- **Keeping columns and tasks consistent on delete.** Decided explicitly (see Key Technical Decisions) whether deleting a column should hard- or soft-cascade its tasks, rather than leaving the behavior as an accidental side effect of the schema.

## 10. What I'd Improve With More Time

- Dedicated CRUD endpoints for `TaskLabel` (create/attach/detach labels on a task)
- Refresh tokens + logout/token revocation
- A `PATCH /boards/:id` rename endpoint (not in the required list, but a natural gap)
- Pagination on `GET /boards` and on tasks within a large board
- A task activity log (who moved what, and when) — listed as a bonus differentiator
- Integration tests (Jest + a test database) covering the move/reorder edge cases specifically
- File attachments on tasks via Multer + cloud storage

## 11. Deployment (Render free tier)

This repo includes `render.yaml` for one-click Blueprint deployment.

**Option A — Blueprint (fastest)**
1. Push this repo to GitHub.
2. In the Render dashboard: **New → Blueprint**, select the repo. Render reads `render.yaml` and provisions both the web service and a free PostgreSQL database automatically, wiring `DATABASE_URL` between them.
3. Render runs `npm install && npm run build && npx prisma migrate deploy`, then starts the app with `npm run start:prod`.

**Option B — Manual**
1. **New → PostgreSQL** → create a free database, copy its **Internal Connection String**.
2. **New → Web Service** → connect the repo.
   - Build command: `npm install && npm run build && npx prisma migrate deploy`
   - Start command: `npm run start:prod`
3. Add environment variables: `DATABASE_URL` (from step 1), `JWT_SECRET` (generate a long random value), `JWT_EXPIRES_IN=1d`, `NODE_ENV=production`, `CORS_ORIGIN=*`.
4. Deploy. Swagger will be live at `https://<your-service>.onrender.com/api/docs`.

**Know the free-tier limits before you rely on them for review:**
- The free web service spins down after 15 minutes of inactivity; the next request wakes it in roughly 30–60 seconds. If a reviewer's first request seems slow, that's why.
- Render's **free PostgreSQL database expires 30 days after creation**, with a 14-day grace period to upgrade before it (and its data) is deleted. For a short internship review window this is fine, but don't treat it as a permanent home for the demo — recreate the database or upgrade if you need it to keep running past that window.
- Free databases don't include backups, so don't store anything you can't afford to lose.

*(Railway and Fly.io both work too, per the assignment's "any of these is fine" — Railway auto-detects the Nest app and needs the same three env vars plus a Postgres plugin; Fly.io needs `fly launch` + `fly postgres create` and a `fly.toml`, not included here since Render was the requested target.)*

## 12. Testing Checklist

- [ ] `POST /auth/register` → 201, no password in response
- [ ] `POST /auth/register` with a duplicate email → 409
- [ ] `POST /auth/login` with correct credentials → 200 + `accessToken`
- [ ] `POST /auth/login` with wrong password → 401
- [ ] `POST /boards` without a token → 401
- [ ] `POST /boards` → 201, includes 5 default columns
- [ ] `GET /boards` → only the caller's own boards
- [ ] `GET /boards/:id` as a different user → 403
- [ ] `GET /boards/:id` with a random UUID → 404
- [ ] `GET /boards/:id?priority=HIGH&search=login` → filters applied
- [ ] `POST /boards/:boardId/columns` → new column appended
- [ ] `POST /columns/:columnId/tasks` → task created at end of column
- [ ] `PATCH /tasks/:id/position` reordering within a column → positions stay contiguous
- [ ] `PATCH /tasks/:id/position` moving across columns → removed cleanly from source, inserted cleanly into target
- [ ] `DELETE /tasks/:id` then `GET /boards/:id` → deleted task no longer appears
- [ ] `DELETE /boards/:id` then `GET /boards` → deleted board no longer appears
- [ ] Swagger UI loads at `/api/docs` and "Authorize" works end-to-end

## 13. Sample Usage (curl)

```bash
# Register
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"StrongPass123"}'

# Login
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com","password":"StrongPass123"}'
# → { "accessToken": "...", "user": {...} }

# Create a board (replace $TOKEN)
curl -X POST http://localhost:5000/boards \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Product Launch Roadmap"}'
```

Or just use `/api/docs` — every endpoint above is documented there with a "Try it out" button.
