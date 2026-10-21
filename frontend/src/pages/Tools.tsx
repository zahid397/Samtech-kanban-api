import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  BookOpen,
  CheckCircle2,
  FileSearch,
  ChartNoAxesCombined,
  Workflow,
  Plus,
  Play,
  Square,
  Terminal,
  Download,
  Upload,
  FileText,
  Power,
  CalendarDays,
  Volume2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import { api, refresh } from '../lib/api';
import type { Workspace, AIResult, Board, AgentRun, Rule, Draft } from '../lib/types';
import { Button } from '../components/ui/button';
import { SectionTitle, ErrorMessage, Empty, Modal, CardTitle } from '../components/Primitives';
import { Result } from './Assistant';
import { download, niceDate } from '../lib/utils';
import { usePreferences } from '../lib/store';
import { speak, stopSpeech } from '../lib/voice';
export function Agents({ data, board }: { data: Workspace; board?: Board }) {
  const [error, setError] = useState('');
  const [goal, setGoal] = useState('');
  const [view, setView] = useState<AgentRun | null>(null);
  const agents = [
    ['planner', 'Project Planner', 'A clear path from idea to launch.', Workflow],
    ['task-manager', 'Task Manager', 'Priorities, dependencies, next steps.', CheckCircle2],
    ['research', 'Research Assistant', 'Find context in your project tasks.', FileSearch],
    ['documentation', 'Documentation Assistant', 'Turn project status into a report.', BookOpen],
    ['analyst', 'Productivity Analyst', 'Understand deadlines and workload.', ChartNoAxesCombined],
    ['qa', 'QA Assistant', 'Prepare quality and acceptance checks.', CheckCircle2],
    ['automation', 'Automation Coordinator', 'Review opportunities for routines.', Bot],
  ] as const;
  const runs = useQuery({
    queryKey: ['agents'],
    queryFn: () => api<AgentRun[]>('/agents'),
    refetchInterval: 3000,
  });
  return (
    <>
      <SectionTitle
        eyebrow="FOCUSED HELP, ON DEMAND"
        title="Meet your crew"
        description="Specialized assistants. Read-only tools. Real execution history."
      />
      <label className="agent-goal">
        Optional goal
        <input
          placeholder="What should your agents focus on?"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          maxLength={4000}
        />
      </label>
      <ErrorMessage message={error || runs.error?.message} />
      <div className="agent-grid">
        {agents.map(([id, name, description, Icon], i) => (
          <article className="glass agent-card" key={id}>
            <div className={`agent-icon tone-${i % 4}`}>
              <Icon size={24} />
            </div>
            <span className="micro-label">SPECIALIST / 0{i + 1}</span>
            <h3>{name}</h3>
            <p>{description}</p>
            <div className="agent-permissions">Project read · Draft only · 50s limit</div>
            <Button
              variant="outline"
              onClick={async () => {
                setError('');
                try {
                  await api('/agents', 'POST', { agent: id, text: goal, boardId: board?.id });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Play size={13} />
              Run agent
            </Button>
          </article>
        ))}
      </div>
      <section className="glass table-panel">
        <CardTitle title="Execution history" />
        {runs.data?.length ? (
          runs.data.map((r) => (
            <div className="execution-row" key={r.id}>
              <Bot size={17} />
              <div>
                <strong>{r.agent}</strong>
                <small>{niceDate(r.createdAt)}</small>
              </div>
              <span className={`status-pill ${r.status}`}>{r.status}</span>
              {r.status === 'running' ? (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await api(`/agents/${r.id}/cancel`, 'POST');
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Square size={13} />
                  Cancel
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setView(r)}>
                  View report
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="muted">No agent has run yet.</p>
        )}
      </section>
      {view && (
        <Modal title={`${view.agent} report`} onClose={() => setView(null)}>
          {view.result ? (
            <Result result={view.result} data={data} />
          ) : (
            <p>{view.error || view.status}</p>
          )}
        </Modal>
      )}
    </>
  );
}
export function Automations({ board }: { board?: Board }) {
  const { data = [], error: queryError } = useQuery({
    queryKey: ['automations'],
    queryFn: () => api<Rule[]>('/automations'),
  });
  const [error, setError] = useState('');
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('Daily workspace briefing');
  const [kind, setKind] = useState('daily-briefing');
  const [hours, setHours] = useState(24);
  const [condition, setCondition] = useState('always');
  const [taskTitle, setTaskTitle] = useState('');
  const [approved, setApproved] = useState(false);
  const [report, setReport] = useState<Rule | null>(null);
  const [busy, setBusy] = useState(false);
  const perform = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle
        eyebrow="LESS REPETITION. MORE CREATION."
        title="Set your work in motion"
        description="Saved rules with conditions, execution history, and an off switch."
        action={
          <Button onClick={() => setCreate(true)}>
            <Plus size={16} />
            New automation
          </Button>
        }
      />
      <div className="notice">
        <Workflow size={18} />
        <p>
          Schedules run while the API worker is awake, or through an authenticated external
          scheduler. A sleeping free instance cannot guarantee on-time reminders.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void perform(() => api('/automations/tick', 'POST'))}
        >
          Run due rules
        </Button>
      </div>
      <ErrorMessage message={error || queryError?.message} />
      <div className="automation-list">
        {data.map((rule) => (
          <div className="glass automation-card" key={rule.id}>
            <div className="agent-icon">
              <Workflow size={22} />
            </div>
            <div>
              <h3>{rule.name}</h3>
              <p>
                {rule.kind} · Every {rule.frequencyHours} hours · Next{' '}
                {new Date(rule.nextRunAt).toLocaleString()}
              </p>
              <small>
                {rule.runs[0]
                  ? `Last execution: ${rule.runs[0].status}`
                  : 'Awaiting first execution'}
              </small>
            </div>
            <Button variant="ghost" onClick={() => setReport(rule)}>
              History
            </Button>
            <button
              role="switch"
              aria-checked={rule.enabled}
              aria-label={`Enable ${rule.name}`}
              className={`switch ${rule.enabled ? 'on' : ''}`}
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  api(`/automations/${rule.id}`, 'PATCH', { enabled: !rule.enabled }),
                )
              }
            >
              <span />
            </button>
          </div>
        ))}
      </div>
      {!data.length && (
        <Empty title="Give busywork a routine">
          Start with a daily briefing or an overdue-task report. Reports stay in your workspace.
        </Empty>
      )}
      {create && (
        <Modal title="Create automation" onClose={() => setCreate(false)}>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await api('/automations', 'POST', {
                  name,
                  kind,
                  frequencyHours: hours,
                  condition,
                  boardId: board?.id,
                  ...(kind === 'recurring-task'
                    ? {
                        columnId: board?.columns[0]?.id,
                        task: { title: taskTitle, priority: 'MEDIUM' },
                      }
                    : {}),
                  approved,
                });
                setCreate(false);
                setApproved(false);
              });
            }}
          >
            <label>
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </label>
            <label>
              Action
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  if (e.target.value === 'weekly-summary') setHours(168);
                }}
              >
                {[
                  'daily-briefing',
                  'weekly-summary',
                  'due-reminder',
                  'overdue-alert',
                  'recurring-task',
                  'dependency-notification',
                  'next-actions',
                  'progress-report',
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Every (hours)
                <input
                  type="number"
                  min={1}
                  max={8760}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                />
              </label>
              <label>
                Condition
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="always">Always</option>
                  <option value="has-open">Has open tasks</option>
                  <option value="has-overdue">Has overdue tasks</option>
                </select>
              </label>
            </div>
            {kind === 'recurring-task' && (
              <label>
                Task title
                <input
                  required
                  value={taskTitle}
                  maxLength={150}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
                <small>
                  Destination: {board?.title} / {board?.columns[0]?.title}
                </small>
              </label>
            )}
            <label className="check-row">
              <input
                type="checkbox"
                required
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
              />
              I approve this recurring {kind === 'recurring-task' ? 'task creation' : 'report'}{' '}
              until I disable the rule.
            </label>
            <ErrorMessage message={error} />
            <Button disabled={busy || !approved}>Approve & enable</Button>
          </form>
        </Modal>
      )}
      {report && (
        <Modal title={report.name} onClose={() => setReport(null)}>
          {report.runs.map((r) => (
            <div className="history-report" key={r.id}>
              <strong>
                {r.status} · {niceDate(r.createdAt)}
              </strong>
              <pre>{r.error || JSON.stringify(r.result, null, 2)}</pre>
            </div>
          ))}
          {!report.runs.length && <p>No executions yet.</p>}
        </Modal>
      )}
    </>
  );
}
export function CommandCenter() {
  const [command, setCommand] = useState('help');
  const [history, setHistory] = useState<{ command: string; output: string; error?: boolean }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const execute = async () => {
    setBusy(true);
    try {
      const r = await api<{ result: unknown }>('/commands', 'POST', { command });
      setHistory((h) => [...h, { command, output: JSON.stringify(r.result, null, 2) }]);
      await refresh();
    } catch (e) {
      setHistory((h) => [...h, { command, output: (e as Error).message, error: true }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle
        eyebrow="ALL SYSTEMS, ONE PROMPT"
        title="Command center"
        description="A direct line to your workspace. Only validated application commands execute."
      />
      <div className="terminal">
        <header>
          <span className="terminal-dots">
            <i />
            <i />
            <i />
          </span>
          <span>sammtech / workspace</span>
          <Terminal size={15} />
        </header>
        <div className="terminal-content">
          <div className="terminal-brand">
            SAMMTECH<span>_</span>
          </div>
          <p>
            Welcome to your command center.
            <br />
            Type help to discover available commands.
          </p>
          {history.map((h, i) => (
            <div key={i}>
              <div className="terminal-prompt">samm@workspace ~ $ {h.command}</div>
              <pre className={h.error ? 'text-danger' : ''}>{h.output}</pre>
            </div>
          ))}
          {busy && <p>Executing…</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void execute();
            }}
          >
            <label htmlFor="terminal-input">samm@workspace ~ $</label>
            <input
              id="terminal-input"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              autoComplete="off"
              maxLength={80}
            />
            <Button size="icon" aria-label="Execute command" disabled={busy}>
              <Play size={14} />
            </Button>
          </form>
        </div>
      </div>
      <div className="command-shortcuts">
        {[
          'boards list',
          'tasks today',
          'tasks overdue',
          'project summarize',
          'agent status',
          'automation list',
          'health',
        ].map((c) => (
          <button key={c} onClick={() => setCommand(c)}>
            {c}
          </button>
        ))}
      </div>
    </>
  );
}
export function Analytics({ data }: { data: Workspace }) {
  const { metrics: m } = data;
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () =>
      api<{
        api: string;
        database: string;
        ai: { status: string; mode?: string };
        scheduler: string;
      }>('/workspace/health'),
    refetchInterval: 30000,
  });
  return (
    <>
      <SectionTitle
        eyebrow="SEE THE BIGGER PICTURE"
        title="Momentum, measured"
        description="Live workspace data. No invented metrics."
      />
      <div className="stat-grid">
        {[
          ['Open tasks', m.tasks - m.completed],
          ['Completed', m.completed],
          ['Overdue', m.overdue],
          ['Workload', `${Math.round((m.workloadMinutes / 60) * 10) / 10}h`],
        ].map(([name, value]) => (
          <div className="glass stat-card" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="two-col">
        <section className="glass chart-panel">
          <CardTitle title="Completions · last 7 days" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={m.trend}>
              <defs>
                <linearGradient id="chartGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b4f86a" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#b4f86a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#263129" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                stroke="#79867b"
                fontSize={11}
              />
              <YAxis allowDecimals={false} stroke="#79867b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#161e18', border: '1px solid #33402e' }} />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#b4f86a"
                fill="url(#chartGreen)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
        <section className="glass chart-panel">
          <CardTitle title="Priority distribution · open tasks" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={m.priorities}>
              <XAxis dataKey="priority" stroke="#79867b" fontSize={11} />
              <YAxis allowDecimals={false} stroke="#79867b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#161e18', border: '1px solid #33402e' }} />
              <Bar dataKey="count" fill="#a8bbff" radius={[6, 6, 0, 0]} maxBarSize={55} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      <div className="two-col">
        <section className="glass table-panel">
          <CardTitle title="Service health" />
          <ErrorMessage message={health.error?.message} />
          {health.data &&
            Object.entries({
              API: health.data.api,
              PostgreSQL: health.data.database,
              'Python intelligence': health.data.ai.status,
              Scheduler: health.data.scheduler,
            }).map(([name, status]) => (
              <div className="result-row" key={name}>
                <span>{name}</span>
                <span className={status === 'ok' ? 'green' : 'muted'}>{status}</span>
              </div>
            ))}
        </section>
        <section className="glass table-panel">
          <CardTitle title="Execution outcomes · recent history" />
          <div className="result-row">
            <span>Agent runs</span>
            <strong>{data.agents.length}</strong>
          </div>
          <div className="result-row">
            <span>Completed automations</span>
            <strong>
              {
                data.automations.flatMap((r) => r.runs).filter((r) => r.status === 'completed')
                  .length
              }
            </strong>
          </div>
          <div className="result-row">
            <span>Failed automations</span>
            <strong>
              {data.automations.flatMap((r) => r.runs).filter((r) => r.status === 'failed').length}
            </strong>
          </div>
        </section>
      </div>
    </>
  );
}
export function Planner({ data, board }: { data: Workspace; board?: Board }) {
  const [result, setResult] = useState<AIResult | null>(null);
  const [minutes, setMinutes] = useState(360);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <SectionTitle
        eyebrow="MAKE SPACE FOR WHAT MATTERS"
        title="A more intentional week"
        description="A capacity-aware draft schedule based on your deadlines, priorities, and dependencies."
      />
      <section className="glass planner">
        <div className="planner-tools">
          <CalendarDays size={24} />
          <label>
            Daily focus capacity (minutes)
            <input
              type="number"
              min={30}
              max={720}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(
                  await api('/ai/interpret', 'POST', {
                    kind: 'plan',
                    text: '',
                    boardId: board?.id,
                    capacityMinutes: minutes,
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Planning…' : 'Build my week'}
          </Button>
        </div>
        <ErrorMessage message={error} />
        {result ? (
          <Result result={result} data={data} />
        ) : (
          <Empty title="Good work needs breathing room">
            Generate a suggestion. Your task dates stay under your control.
          </Empty>
        )}
      </section>
    </>
  );
}
export function Files({ data, board }: { data: Workspace; board?: Board }) {
  const files = useQuery({
    queryKey: ['files'],
    queryFn: () => api<{ id: string; name: string; createdAt: string }[]>('/files'),
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Draft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100000) throw new Error('Text files must be under 100 KB');
      const content = await file.text();
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        const tasks = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.columns)
            ? parsed.columns.flatMap((c: any) => c.tasks)
            : parsed.tasks;
        if (!Array.isArray(tasks)) throw new Error('Expected a task array or exported board');
        setPending(
          tasks
            .slice(0, 100)
            .map((t: any) => ({
              title: t.title,
              description: t.description || '',
              priority: t.priority || 'MEDIUM',
              dueDate: t.dueDate || null,
              estimateMinutes: t.estimateMinutes || 60,
              labels: t.labels?.map((l: any) => ({ name: l.name, color: l.color })),
              checklist: t.checklist?.map((c: any) => ({ title: c.title, done: c.done })),
            })),
        );
      } else {
        await api('/files', 'POST', { name: file.name, content });
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <SectionTitle
        eyebrow="KEEP THE CONTEXT CLOSE"
        title="Your workspace library"
        description="Save text notes, export projects, and import task drafts for review."
        action={
          <label className="button button-primary">
            <Upload size={15} />
            Upload text or JSON
            <input
              type="file"
              className="sr-only"
              accept=".txt,.md,.json,.csv"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
        }
      />
      <ErrorMessage message={error || files.error?.message} />
      <div className="file-grid">
        {files.data?.map((f) => (
          <button
            className="glass file-card"
            key={f.id}
            onClick={async () => {
              try {
                const file = await api<{ name: string; content: string }>(`/files/${f.id}`);
                download(file.name, file.content);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <FileText size={30} />
            <strong>{f.name}</strong>
            <span>{niceDate(f.createdAt)}</span>
            <Download size={15} />
          </button>
        ))}
        <button
          className="glass file-card export-card"
          onClick={() => download('sammtech-tasks.json', JSON.stringify(data.tasks, null, 2))}
        >
          <Download size={30} />
          <strong>Export all tasks</strong>
          <span>{data.tasks.length} tasks · JSON</span>
        </button>
      </div>
      {pending && (
        <Modal title={`Review ${pending.length} imported tasks`} onClose={() => setPending(null)}>
          <p>
            Destination: {board?.title} / {board?.columns[0]?.title}
          </p>
          <div className="import-preview">
            {pending.map((t, i) => (
              <p key={i}>
                {t.title} <span className="muted">{t.priority}</span>
              </p>
            ))}
          </div>
          <ErrorMessage message={error} />
          <Button
            disabled={!board || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/tasks/import', 'POST', {
                  columnId: board?.columns[0]?.id,
                  approved: true,
                  tasks: pending,
                });
                await refresh();
                setPending(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Approve import
          </Button>
        </Modal>
      )}
    </>
  );
}
export function Settings() {
  const prefs = usePreferences();
  return (
    <>
      <SectionTitle
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your workspace, your way"
        description="Preferences are saved on this device."
      />
      <section className="glass settings-panel">
        {[
          [
            'voice',
            'Voice greetings & replies',
            'Start speech after your interaction. Browser voice availability varies.',
          ],
          [
            'localVoice',
            'Use local speech',
            'Requires configured Whisper and Piper models. Browser speech is the fallback.',
          ],
          [
            'reducedMotion',
            'Reduced motion',
            'Keep movement gentle and disable decorative animations.',
          ],
          [
            'lowPerformance',
            'Low-performance mode',
            'Replace the 3D scene with a lightweight original robot illustration.',
          ],
        ].map(([key, title, description]) => (
          <div className="setting" key={key}>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
            <button
              role="switch"
              aria-label={title}
              aria-checked={prefs[key as 'voice']}
              className={`switch ${prefs[key as 'voice'] ? 'on' : ''}`}
              onClick={() => {
                prefs.set({ [key]: !prefs[key as 'voice'] });
                if (key === 'voice' && prefs.voice) stopSpeech();
              }}
            >
              <span />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            prefs.set({ voice: true });
            void speak(
              "Hello! Welcome back to SammTech AI. I'm your personal workspace assistant. What shall we build today?",
            );
          }}
        >
          <Volume2 size={17} />
          Play greeting
        </Button>
        <div className="privacy-note">
          <Power size={18} />
          <p>
            English is supported first. Browser speech recognition may send audio to the browser
            provider. Choose local speech for offline processing. No application recording history
            is retained.
          </p>
        </div>
      </section>
    </>
  );
}
