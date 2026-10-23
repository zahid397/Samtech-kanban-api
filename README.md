# SammTech AI OS

### Build your day. Organize your work. Meet Samm.

**SammTech AI OS** is a full-stack, AI-assisted productivity workspace that brings project management, Kanban boards, task automation, analytics, and a voice-enabled assistant into one experience.

Built with **React, TypeScript, NestJS, PostgreSQL, Prisma, Python, and FastAPI**.

[**Launch Live App →**](https://samtech-kanban-api-six.vercel.app/) · [**Explore Backend API →**](https://samtech-kanban-api.onrender.com/api/docs) · [**Source Code**](https://github.com/zahid397/Samtech-kanban-api)

| Application | Deployment | Link |
| :-- | :-- | :-- |
| **Frontend** | Vercel — deployed | [Open SammTech AI OS](https://samtech-kanban-api-six.vercel.app/) |
| **Backend** | Render — deployed | [Swagger API Documentation](https://samtech-kanban-api.onrender.com/api/docs) |

> **Made for focused work:** plan visually, manage projects, get practical assistance, and keep important actions under your control.

---

## ✨ What You Can Do

| Feature | Experience |
| :-- | :-- |
| **Projects & Kanban** | Personal boards, custom columns, drag-and-drop tasks, priorities, deadlines, checklists, comments, and dependencies. |
| **Workspace dashboard** | Projects, task details, planner, calendar, derived notifications, and quick navigation in one responsive UI. |
| **Meet Samm** | An original interactive 3D assistant with listening, thinking, speaking, and feedback states, plus reduced-motion support. |
| **Voice workspace** | Push-to-talk, browser speech input/output when supported, stop-speaking controls, and microphone-state feedback. |
| **AI-assisted actions** | Turn supported text or voice requests into editable task drafts; review and approve changes before they are saved. |
| **Agent workflows** | Seven bounded, cancellable assistance roles operating on authorized workspace data. |
| **Automations** | Configure workspace rules, schedules, reports, and see execution history. |
| **Analytics** | View task and workflow trends based on saved application data. |
| **Workspace utilities** | Search, command center, text notes, JSON task import/export, profile, and light/dark appearance. |

### A task flow that puts you in control

1. Ask Samm to help create or update a task.
2. Review the suggested action and edit its details.
3. Explicitly approve the change.
4. The authenticated NestJS API validates and saves it to PostgreSQL.
5. Your board refreshes with the saved result and an audit record.

**No silent writes:** saying “yes” to voice recognition alone does not authorize a database change.

---

## 🧩 How It Works

~~~mermaid
flowchart LR
  U[User] --> FE[React + TypeScript + Vite]
  FE -->|Authenticated API requests| BE[NestJS + TypeScript]
  BE -->|Prisma transactions| DB[(PostgreSQL)]
  BE -->|Private service integration| AI[Python + FastAPI]
  AI -->|Suggestions and explanations| BE
  BE -->|Validated responses| FE
~~~

The **NestJS API** is the authority for authentication, ownership checks, validation, and database writes. The Python service supports bounded, explainable task assistance; users remain responsible for approving changes.

### Technology Stack

| Layer | Technologies |
| :-- | :-- |
| **Frontend** | React, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand |
| **Interface** | Three.js, React Three Fiber, Drei, Motion, dnd-kit, Recharts |
| **Backend** | NestJS, Node.js, TypeScript, REST APIs, JWT |
| **Data** | PostgreSQL, Prisma |
| **AI assistance** | Python 3.12, FastAPI, scikit-learn, deterministic workflows and TF-IDF search |
| **Quality & delivery** | GitHub Actions, Node test runner, Python pytest, Playwright, Docker Compose |
| **Hosting** | Vercel (frontend), Render (API) |

The built-in lightweight intelligence works **without a commercial AI API key**. Optional local models and speech adapters are separate integrations rather than a claim that a large language model ships with the app.

---

## 🚀 Run It Locally

### Requirements

- Node.js **24.22.1+** in the supported 24.x line, or **22.23.4+** in the supported 22.x line
- npm and **Python 3.12**
- PostgreSQL **16+** (Docker Desktop is optional)
- Git

### 1. Clone and install

~~~bash
git clone https://github.com/zahid397/Samtech-kanban-api.git
cd Samtech-kanban-api
npm ci
npm --prefix frontend ci
~~~

Create the Python environment on macOS/Linux:

~~~bash
python3.12 -m venv ai-engine/.venv
ai-engine/.venv/bin/python -m pip install --require-hashes -r ai-engine/requirements-dev.lock
ai-engine/.venv/bin/python -m pip install --no-deps -e ./ai-engine
~~~

On Windows, use **py -3.12 -m venv ai-engine/.venv** and the Python executable inside **ai-engine/.venv/Scripts/**. More details: [Windows setup guide](docs/LOCAL_WINDOWS.md).

### 2. Configure the environment

Copy **.env.example** to **.env**. Configure the PostgreSQL connection (**DATABASE_URL**) and independent random values of at least 32 characters for **JWT_SECRET**, **AI_SERVICE_KEY**, and **SCHEDULER_SECRET**.

For a **new local database**, you can use:

~~~bash
docker compose up -d database
node scripts/migrate-safe.cjs
~~~

If you are connecting to an existing database, review the [migration guide](docs/MIGRATIONS.md) and back up its data first.

### 3. Launch the application

Open three terminals in the repository root:

**Terminal A — NestJS backend**

~~~bash
npm run start:dev
~~~

**Terminal B — Python assistance service**

~~~bash
node scripts/run-ai.cjs
~~~

**Terminal C — React frontend**

~~~bash
npm --prefix frontend run dev
~~~

| Local address | Service |
| :-- | :-- |
| http://localhost:5173 | Frontend |
| http://localhost:5000/api/docs | API documentation |
| http://localhost:5000/health/ready | API/database readiness |

Create an account, start a board, and try: **“Create a task called Fix Login Bug by tomorrow.”** Review the draft, approve it, and refresh your board to see the saved result.

---

## 🧪 Testing & Reliability

The project includes backend unit tests, PostgreSQL integration tests, Python tests, migration safety checks, and browser-level tests.

The last documented full local verification reported:

| Test suite | Result |
| :-- | --: |
| Backend unit tests | **7 passed** |
| PostgreSQL integration tests | **9 passed** |
| Python tests | **44 passed** |
| Playwright browser scenarios | **10 passed** |
| Migration safety scenarios | **3 passed** |

Run routine checks:

~~~bash
npm run verify
~~~

For full integration and browser verification, configure a **disposable database named sammtech_test** and run:

~~~bash
npm run verify:all
~~~

See [Testing Guide](docs/TESTING.md) for prerequisites and Windows instructions. Integration tests must never target a production database.

---

## 📁 Project Structure

~~~text
Samtech-kanban-api/
├── src/                   NestJS API, auth, workspace and agents
├── frontend/              React workspace and Samm interface
├── ai-engine/             Python/FastAPI assistance service
├── prisma/                PostgreSQL schema and migrations
├── test/                  Backend tests
├── scripts/               Verification and safe database startup
├── docs/                  Setup, deployment, security and testing guides
├── compose.yaml           Local database configuration
└── render.yaml            Hosting blueprint
~~~

## 🔐 Designed With Care

- JWT authentication, per-user ownership checks, input validation, and audit-friendly operations.
- Protected updates with explicit user approval.
- Backend-authorized database transactions rather than direct AI writes.
- Configuration secrets stay server-side and out of the repository.
- Safe migration tooling and repeatable automated checks.

**Current feature scope:** AI suggestions use lightweight rules and search unless optional models are configured. Browser speech depends on device/browser support. Automations create workspace reports; external email/push delivery, paid billing, and shared-team administration are not currently included.

For operational details, see [Deployment](docs/DEPLOYMENT.md), [Security](docs/SECURITY.md), [Migrations](docs/MIGRATIONS.md), and [Testing](docs/TESTING.md).

---

### Built by Zahid Hasan

[GitHub](https://github.com/zahid397) · [Portfolio](https://zahidprotfilio.vercel.app)

**SammTech AI OS — a smarter workspace, built one practical feature at a time.**
