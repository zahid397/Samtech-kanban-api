import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FolderKanban,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Empty, ErrorMessage, Loading, Modal, SectionTitle } from '../components/Primitives';
import { api, refresh, useSession } from '../lib/api';
import type { Task, Workspace } from '../lib/types';
import './workspace-extras.css';

type Navigate = (page: string, query?: string, boardId?: string) => void;
const projectFor = (data: Workspace, task: Task) =>
  data.boards.find((b) => b.columns.some((c) => c.id === task.columnId));

export function Projects({ data, navigate }: { data: Workspace; navigate: Navigate }) {
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <SectionTitle
        eyebrow="A HOME FOR EVERY AMBITION"
        title="Your projects"
        description="Real progress, one thoughtful step at a time."
        action={
          <Button onClick={() => navigate('Kanban Projects')}>
            Open project workspace <ArrowUpRight size={16} />
          </Button>
        }
      />
      <div className="project-overview-grid">
        {data.boards.map((board) => {
          const tasks = board.columns.flatMap((c) => c.tasks);
          const done = tasks.filter((t) => t.completedAt).length;
          const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
          return (
            <article className="glass project-overview-card" key={board.id}>
              <div className="extra-card-top">
                <FolderKanban size={24} />
                <span>{board.columns.length} columns</span>
              </div>
              <h2>{board.title}</h2>
              <p>
                {done} of {tasks.length} tasks completed
              </p>
              <progress aria-label={`${board.title} completion`} max={100} value={progress} />
              <div className="extra-card-top">
                <strong>{progress}% complete</strong>
                <small>
                  {tasks.filter((t) => !t.completedAt && t.priority === 'HIGH').length} high
                  priority
                </small>
              </div>
              <div className="extra-actions">
                <Button onClick={() => navigate('Kanban Projects', '', board.id)}>
                  Open board <ArrowUpRight size={15} />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setError('');
                    setEditing({ id: board.id, title: board.title });
                  }}
                >
                  Rename
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {!data.boards.length && (
        <Empty
          icon={<FolderKanban size={28} />}
          title="Make space for your next idea"
          text="Create a project in your Kanban workspace to start organizing tasks."
          action={<Button onClick={() => navigate('Kanban Projects')}>Create a project</Button>}
        />
      )}
      {editing && (
        <Modal title="Rename project" onClose={() => !busy && setEditing(null)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api(`/boards/${editing.id}`, 'PATCH', { title: editing.title.trim() });
                await refresh();
                setEditing(null);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Project title
              <input
                required
                maxLength={100}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <ErrorMessage message={error} />
            <Button disabled={busy || !editing.title.trim()}>
              {busy ? 'Saving…' : 'Save project name'}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function Calendar({ data, navigate }: { data: Workspace; navigate: Navigate }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });
  const [selected, setSelected] = useState(new Date().toISOString().slice(0, 10));
  const start = new Date(month);
  start.setUTCDate(1 - ((month.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const due = useMemo(
    () => data.tasks.filter((t) => t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)),
    [data.tasks],
  );
  const selectedTasks = due.filter((t) => t.dueDate!.slice(0, 10) === selected);
  const step = (n: number) =>
    setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + n, 1)));
  return (
    <>
      <SectionTitle
        eyebrow="A LITTLE ROOM TO PLAN AHEAD"
        title="Calendar & deadlines"
        description="Your saved deadlines, shown in UTC. Select a day to see its tasks."
      />
      <div className="calendar-layout">
        <section className="glass calendar-panel">
          <div className="calendar-toolbar">
            <h2>
              {month.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
              })}
            </h2>
            <div className="extra-actions">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous month"
                onClick={() => step(-1)}
              >
                <ChevronLeft size={18} />
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const now = new Date();
                  setMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
                  setSelected(now.toISOString().slice(0, 10));
                }}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => step(1)}>
                <ChevronRight size={18} />
              </Button>
            </div>
          </div>
          <div className="calendar-grid" role="group" aria-label="Deadline calendar">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <span className="calendar-weekday" key={d}>
                {d}
              </span>
            ))}
            {days.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const tasks = due.filter((t) => t.dueDate!.slice(0, 10) === key);
              return (
                <button
                  key={key}
                  aria-label={`${key}, ${tasks.length} deadlines`}
                  aria-pressed={selected === key}
                  className={`calendar-day ${day.getUTCMonth() !== month.getUTCMonth() ? 'outside' : ''} ${key === selected ? 'selected' : ''}`}
                  onClick={() => setSelected(key)}
                >
                  <span>{day.getUTCDate()}</span>
                  {tasks.slice(0, 2).map((t) => (
                    <small className={t.completedAt ? 'deadline-done' : ''} key={t.id}>
                      {t.title}
                    </small>
                  ))}
                  {tasks.length > 2 && <small>+{tasks.length - 2} more</small>}
                </button>
              );
            })}
          </div>
        </section>
        <aside className="glass calendar-agenda">
          <span className="eyebrow">SELECTED DAY · UTC</span>
          <h2>{selected}</h2>
          {selectedTasks.length ? (
            selectedTasks.map((task) => (
              <button
                className="agenda-task"
                key={task.id}
                onClick={() => navigate('Kanban Projects', task.title, projectFor(data, task)?.id)}
              >
                <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
                <strong>{task.title}</strong>
                <small>
                  {projectFor(data, task)?.title} · {task.completedAt ? 'Completed' : 'Open task'}
                </small>
              </button>
            ))
          ) : (
            <Empty
              icon={<CalendarDays size={25} />}
              title="A little breathing room"
              text="No tasks are due on this day."
            />
          )}
        </aside>
      </div>
    </>
  );
}

export function Notifications({ data, navigate }: { data: Workspace; navigate: Navigate }) {
  const email = useSession((s) => s.user.email);
  const key = `sammtech-notifications-read:${email}`;
  const [read, setRead] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const now = Date.now();
  const entries = [
    ...data.tasks
      .filter(
        (t) => !t.completedAt && t.dueDate && new Date(t.dueDate).getTime() < now + 48 * 3600000,
      )
      .map((task) => ({
        id: `due:${task.id}:${task.dueDate}`,
        title: new Date(task.dueDate!).getTime() < now ? 'Task overdue' : 'Deadline approaching',
        detail: task.title,
        time: task.dueDate!,
        open: () => navigate('Kanban Projects', task.title, projectFor(data, task)?.id),
      })),
    ...data.agents
      .filter((a) => a.status === 'failed')
      .map((a) => ({
        id: a.id,
        title: 'Agent needs attention',
        detail: a.error || a.agent,
        time: a.createdAt,
        open: () => navigate('AI Agents'),
      })),
    ...data.automations.flatMap((rule) =>
      rule.runs
        .filter((r) => r.status === 'failed')
        .map((r) => ({
          id: r.id,
          title: 'Automation needs attention',
          detail: `${rule.name}: ${r.error || 'Execution failed'}`,
          time: r.createdAt,
          open: () => navigate('Automations'),
        })),
    ),
  ].sort((a, b) => b.time.localeCompare(a.time));
  const mark = (ids: string[]) => {
    const next = Array.from(new Set([...read, ...ids])).slice(-500);
    setRead(next);
    sessionStorage.setItem(key, JSON.stringify(next));
  };
  return (
    <>
      <SectionTitle
        eyebrow="THE THINGS THAT DESERVE YOUR ATTENTION"
        title="Notifications"
        description="Derived from your saved deadlines and execution failures. Read status stays in this browser tab."
        action={
          <Button
            variant="outline"
            disabled={!entries.some((e) => !read.includes(e.id))}
            onClick={() => mark(entries.map((e) => e.id))}
          >
            <Check size={16} />
            Mark all as read
          </Button>
        }
      />
      <label className="extra-checkbox">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => setUnreadOnly(e.target.checked)}
        />
        Show unread only
      </label>
      <div className="notification-list">
        {entries
          .filter((e) => !unreadOnly || !read.includes(e.id))
          .map((entry) => (
            <article
              key={entry.id}
              className={`glass notification-card ${read.includes(entry.id) ? 'read' : ''}`}
            >
              <Bell size={20} />
              <div>
                <h3>{entry.title}</h3>
                <p>{entry.detail}</p>
                <small>{new Date(entry.time).toLocaleString()}</small>
              </div>
              <div className="extra-actions">
                <Button
                  variant="ghost"
                  onClick={() => {
                    mark([entry.id]);
                    entry.open();
                  }}
                >
                  View
                </Button>
                {!read.includes(entry.id) && (
                  <Button
                    variant="ghost"
                    aria-label={`Mark ${entry.detail} as read`}
                    onClick={() => mark([entry.id])}
                  >
                    <Check size={16} />
                  </Button>
                )}
              </div>
            </article>
          ))}
      </div>
      {!entries.filter((e) => !unreadOnly || !read.includes(e.id)).length && (
        <Empty
          icon={<Bell size={27} />}
          title="You're all caught up"
          text="Upcoming deadlines, overdue tasks and failed executions will appear here."
        />
      )}
    </>
  );
}

export function Team({ data }: { data: Workspace }) {
  const user = useSession((s) => s.user);
  return (
    <>
      <SectionTitle
        eyebrow="YOUR SPACE TO BUILD"
        title="Team workspace"
        description="Your current workspace is personal. Shared membership and invitations are not enabled."
      />
      <section className="glass personal-workspace">
        <Users size={30} />
        <div>
          <h2>{user.name}'s workspace</h2>
          <p>
            {data.boards.length} projects · {data.tasks.length} tasks · 1 account owner
          </p>
        </div>
        <span className="preview-chip">Personal workspace</span>
      </section>
      <section className="glass team-member">
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{user.name}</strong>
          <p>{user.email}</p>
        </div>
        <span>Owner</span>
      </section>
      <div className="privacy-note">
        <p>
          Team invitations, shared boards and administrator roles require a membership backend. Your
          existing boards retain their per-account access controls.
        </p>
      </div>
    </>
  );
}

type Subscription = {
  plan: string;
  status: string;
  billingConfigured: boolean;
  paidPlansAvailable: boolean;
  entitlements: Record<string, boolean>;
  usage: Record<string, number>;
  limits: Record<string, number>;
};
export function Subscription() {
  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api<Subscription>('/workspace/subscription'),
  });
  const [chosen, setChosen] = useState<'PRO' | 'ENTERPRISE' | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const plans = [
    {
      name: 'STARTER',
      tag: 'Your current workspace',
      description: 'A thoughtful place to begin.',
      features: [
        'Core Kanban and project tools',
        'Samm task drafts and text assistance',
        'Browser voice with device support',
        'Current preview analytics and automations',
      ],
    },
    {
      name: 'PRO',
      tag: 'Planned expansion',
      description: 'More room for ambitious work.',
      features: [
        'Planned higher AI allowances',
        'Expanded workflow automation',
        'Advanced productivity insights',
        'Optional premium capabilities',
      ],
    },
    {
      name: 'ENTERPRISE',
      tag: 'Planned expansion',
      description: 'Built to grow with your organization.',
      features: [
        'Planned team administration',
        'Advanced organizational access',
        'Custom integration options',
        'Enterprise deployment options',
      ],
    },
  ];
  return (
    <>
      <SectionTitle
        eyebrow="BUILD AT YOUR OWN PACE"
        title="Plans & subscription"
        description="Explore the product direction. Prices and paid availability have not been announced."
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <>
          <ErrorMessage message={query.error.message} />
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry subscription status
          </Button>
        </>
      ) : query.data ? (
        <>
          <section className="glass subscription-status">
            <CreditCard size={27} />
            <div>
              <h2>
                {query.data.plan} · {query.data.status}
              </h2>
              <p>
                {query.data.billingConfigured
                  ? 'Billing provider configured'
                  : 'Billing is not connected. No payment method or active paid subscription.'}
              </p>
            </div>
            <span className="preview-chip">No charges</span>
          </section>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article className="glass pricing-card" key={plan.name}>
                <span className="eyebrow">{plan.tag}</span>
                <h2>{plan.name}</h2>
                <p>{plan.description}</p>
                <strong className="price-unannounced">
                  {plan.name === 'STARTER' ? 'Preview access' : 'Pricing to be announced'}
                </strong>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <Check size={15} />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.name === 'STARTER' ? (
                  <span className="preview-chip">Current plan</span>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setApproved(false);
                      setChosen(plan.name as 'PRO' | 'ENTERPRISE');
                      setError('');
                    }}
                  >
                    Record plan interest
                  </Button>
                )}
              </article>
            ))}
          </div>
          <section className="glass usage-panel">
            <h2>Your actual workspace usage</h2>
            <p className="muted">
              Counts come from your account. These are not token estimates or invoices.
            </p>
            <div className="usage-grid">
              {Object.entries(query.data.usage).map(([name, value]) => (
                <div key={name}>
                  <span>{name.replace(/([A-Z])/g, ' $1')}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <details>
              <summary>Current enforced service limits</summary>
              <dl>
                {Object.entries(query.data.limits).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
          <section className="glass entitlement-panel">
            <h2>Feature availability</h2>
            <ul>
              {Object.entries(query.data.entitlements).map(([name, enabled]) => (
                <li key={name}>
                  <span>{name.replace(/([A-Z])/g, ' $1')}</span>
                  <strong>{enabled ? 'Available' : 'Not enabled'}</strong>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      {message && (
        <p className="assistant-message" role="status">
          {message}
        </p>
      )}
      {chosen && (
        <Modal title={`Interest in ${chosen}`} onClose={() => !busy && setChosen(null)}>
          <p>
            This saves your interest in your workspace audit history. It does not activate a plan,
            contact a sales team, or charge you.
          </p>
          <label className="extra-checkbox">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            I want to record my plan interest.
          </label>
          <ErrorMessage message={error} />
          <Button
            disabled={!approved || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/workspace/subscription/upgrade-interest', 'POST', {
                  plan: chosen,
                  approved: true,
                });
                await refresh();
                setChosen(null);
                setMessage(
                  'Your plan interest was recorded. Your subscription and charges are unchanged.',
                );
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Recording…' : 'Confirm plan interest'}
          </Button>
        </Modal>
      )}
    </>
  );
}
