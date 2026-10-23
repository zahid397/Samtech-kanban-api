import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, MotionConfig } from 'motion/react';
import {
  LayoutDashboard,
  Bot,
  Mic,
  Users,
  Columns3,
  Terminal,
  Workflow,
  CalendarDays,
  ChartNoAxesCombined,
  FolderOpen,
  Settings as SettingsIcon,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Sparkles,
  CheckCheck,
  Clock3,
  ChevronRight,
  Command,
  Volume2,
  LoaderCircle,
  Sun,
  Moon,
  Bell,
  CreditCard,
  FolderKanban,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { CardTitle, Empty, ErrorMessage, Loading } from './components/Primitives';
import { api, useSession } from './lib/api';
import { usePreferences, useMascot } from './lib/store';
import { speak, stopSpeech } from './lib/voice';
import type { Workspace } from './lib/types';
import { niceDate } from './lib/utils';
import Kanban from './pages/Kanban';
import Assistant from './pages/Assistant';
const Mascot = lazy(() => import('./components/Mascot'));
const Tools = () => import('./pages/Tools');
const Agents = lazy(() => Tools().then((m) => ({ default: m.Agents })));
const Automations = lazy(() => Tools().then((m) => ({ default: m.Automations })));
const Analytics = lazy(() => Tools().then((m) => ({ default: m.Analytics })));
const Planner = lazy(() => Tools().then((m) => ({ default: m.Planner })));
const Files = lazy(() => Tools().then((m) => ({ default: m.Files })));
const Settings = lazy(() => Tools().then((m) => ({ default: m.Settings })));
const CommandCenter = lazy(() => Tools().then((m) => ({ default: m.CommandCenter })));
const Extras = () => import('./pages/WorkspaceExtras');
const Projects = lazy(() => Extras().then((m) => ({ default: m.Projects })));
const Calendar = lazy(() => Extras().then((m) => ({ default: m.Calendar })));
const Notifications = lazy(() => Extras().then((m) => ({ default: m.Notifications })));
const Team = lazy(() => Extras().then((m) => ({ default: m.Team })));
const Subscription = lazy(() => Extras().then((m) => ({ default: m.Subscription })));
const navigation = [
  ['Dashboard', LayoutDashboard],
  ['Projects', FolderKanban],
  ['AI Assistant', Bot],
  ['Voice Workspace', Mic],
  ['AI Agents', Users],
  ['Kanban Projects', Columns3],
  ['Command Center', Terminal],
  ['Automations', Workflow],
  ['Smart Planner', CalendarDays],
  ['Calendar', CalendarDays],
  ['Team Workspace', Users],
  ['Notifications', Bell],
  ['Analytics', ChartNoAxesCombined],
  ['Files', FolderOpen],
  ['Subscription', CreditCard],
  ['Settings', SettingsIcon],
] as const;
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="mascot-fallback">
        <div className="robot-face">
          <i />
          <i />
          <span />
        </div>
        <small>SAMM · READY</small>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Scene() {
  const low = usePreferences((s) => s.lowPerformance);
  if (low)
    return (
      <div className="mascot-fallback" role="img" aria-label="Samm, your assistant, is ready">
        <div className="robot-face">
          <i />
          <i />
          <span />
        </div>
        <small>SAMM · READY</small>
      </div>
    );
  return (
    <SceneBoundary>
      <Suspense
        fallback={
          <div className="scene-loading">
            <Sparkles size={32} />
          </div>
        }
      >
        <Mascot />
      </Suspense>
    </SceneBoundary>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">S</span>
      <span>
        SAMMTECH<small>AI OPERATING SYSTEM</small>
      </span>
    </div>
  );
}
function Auth() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useSession();
  return (
    <main className="auth-screen">
      <div className="auth-brand">
        <Brand />
      </div>
      <div className="auth-visual">
        <span className="eyebrow">
          <i className="status-dot" /> A LITTLE INTELLIGENCE. ENDLESS POSSIBILITY.
        </span>
        <h1>
          Your ideas.
          <br />A whole new
          <br />
          <em>dimension.</em>
        </h1>
        <p>
          Meet your personal space to think, plan, and build.
          <br />
          With a little help from Samm.
        </p>
        <div className="auth-mascot">
          <div className="orbital ring-one" />
          <div className="orbital ring-two" />
          <Scene />
          <span className="floating-tag tag-one">
            <Sparkles size={14} />
            Ideas into action
          </span>
          <span className="floating-tag tag-two">
            <CheckCheck size={14} />
            Your next chapter
          </span>
        </div>
        <span className="auth-footnote">OPEN INTELLIGENCE · HUMAN CONTROL</span>
      </div>
      <section className="auth-card glass">
        <span className="micro-label">YOUR WORKSPACE IS WAITING</span>
        <h2>{register ? 'Start something great.' : 'Welcome back.'}</h2>
        <p>
          {register
            ? 'Create your personal SammTech workspace.'
            : 'Good to see you. Let’s make something happen.'}
        </p>
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              if (register) await api('/auth/register', 'POST', { email, password, name });
              const data = await api<{
                accessToken: string;
                user: { name: string; email: string };
              }>('/auth/login', 'POST', { email, password });
              session.set(data.accessToken, data.user);
              useMascot.getState().event('HAPPY');
              if (usePreferences.getState().voice)
                void speak(
                  "Hello! I'm Samm, your AI workspace assistant. How can I help you today?",
                );
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {register && (
            <label>
              Your name
              <input
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should Samm call you?"
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete={register ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </label>
          <ErrorMessage message={error} />
          <Button disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : register ? (
              'Create workspace'
            ) : (
              'Enter workspace'
            )}
            <ArrowRight size={17} />
          </Button>
        </form>
        <div className="auth-switch">
          {register ? 'Already have a workspace?' : 'New around here?'}{' '}
          <button
            onClick={() => {
              setRegister(!register);
              setError('');
            }}
          >
            {register ? 'Sign in' : 'Create an account'}
          </button>
        </div>
        <div className="auth-note">
          <span className="small-orbit">✳</span>
          <p>
            Your data stays yours.
            <br />
            No commercial AI subscription required.
          </p>
        </div>
      </section>
    </main>
  );
}
function Dashboard({ data, navigate }: { data: Workspace; navigate: (s: string) => void }) {
  const name = useSession((s) => s.user.name).split(' ')[0];
  const m = data.metrics;
  const prefs = usePreferences();
  const open = data.tasks
    .filter((t) => !t.completedAt)
    .sort(
      (a, b) => new Date(a.dueDate || '9999').getTime() - new Date(b.dueDate || '9999').getTime(),
    );
  return (
    <>
      <div className="welcome-line">
        <div>
          <span className="eyebrow">YOUR SPACE TO DO GREAT THINGS</span>
          <h1>
            Hey {name}
            <span className="wave">✦</span> Let’s make progress.
          </h1>
          <p>A clear mind. A little momentum. Your next big thing.</p>
        </div>
        <span className="today-label">
          <CalendarDays size={15} />
          {new Date().toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>
      <section className="hero glass">
        <div className="hero-grid" />
        <div className="hero-copy">
          <span className="hero-pill">
            <span className="spark-circle">✳</span> MEET YOUR WORKSPACE COMPANION
          </span>
          <h2>
            Big ideas.
            <br />
            Meet your <em>unfair advantage.</em>
          </h2>
          <p>
            Plan the next move. Clear the busywork.
            <br />
            Build something you’re proud of, with Samm by your side.
          </p>
          <div className="hero-actions">
            <Button onClick={() => navigate('AI Assistant')}>
              <Sparkles size={16} />
              Let’s build something
              <ArrowUpRight size={17} />
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                prefs.set({ voice: true });
                void speak(
                  "Hello! I'm Samm, your AI workspace assistant. How can I help you today?",
                );
              }}
            >
              <Volume2 size={17} />
              Say hello
            </Button>
          </div>
          <div className="hero-mode">
            <i className="status-dot" /> Your workspace. Your pace. Your control.
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-glow" />
          <div className="orbital ring-one" />
          <div className="orbital ring-two" />
          <Scene />
          <div className="floating-tag tag-one">
            <span className="spark-circle">✳</span> Hey, I’m Samm!
          </div>
          <div className="floating-tag tag-two">
            <span className="status-dot" /> Ready for your next idea
          </div>
          <span className="coordinates">SAMM / COMPANION 01</span>
        </div>
      </section>
      <div className="stat-grid">
        {[
          [Columns3, 'Active projects', m.boards, 'A place for every idea'],
          [CheckCheck, 'Tasks completed', m.completed, `${m.tasks} tasks in your workspace`],
          [Clock3, 'Upcoming deadlines', m.upcoming, 'Within the next 7 days'],
          [
            Workflow,
            'Enabled automations',
            data.automations.filter((a) => a.enabled).length,
            'Your routines, on repeat',
          ],
        ].map(([Icon, label, value, sub], i) => {
          const I = Icon as typeof Columns3;
          return (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass stat-card"
              key={String(label)}
            >
              <div className="stat-label">
                <span>{String(label)}</span>
                <I size={17} />
              </div>
              <strong>
                {value as number}
                <span className="stat-decoration">{['↗', '✓', '◷', 'ϟ'][i]}</span>
              </strong>
              <small>{String(sub)}</small>
            </motion.div>
          );
        })}
      </div>
      <div className="dashboard-bottom">
        <section className="glass focus-panel">
          <CardTitle
            title="Your focus, right now"
            action="Open projects"
            onClick={() => navigate('Kanban Projects')}
          />
          {open.length ? (
            <div className="focus-list">
              {open.slice(0, 4).map((t) => (
                <button key={t.id} onClick={() => navigate('Kanban Projects')}>
                  <span className="task-checkbox" />
                  <div>
                    <strong>{t.title}</strong>
                    <small>
                      {data.boards.find((b) => b.columns.some((c) => c.id === t.columnId))?.title}
                    </small>
                  </div>
                  <span className={`priority ${t.priority.toLowerCase()}`}>
                    {t.priority.toLowerCase()}
                  </span>
                  <span className="focus-due">{niceDate(t.dueDate)}</span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="A fresh canvas"
              action={
                <Button variant="outline" onClick={() => navigate('Kanban Projects')}>
                  <Plus size={15} />
                  Create your first project
                </Button>
              }
            >
              Your next great idea belongs here.
            </Empty>
          )}
        </section>
        <section className="glass activity-panel">
          <CardTitle title="Workspace pulse" />
          <div className="activity-feed">
            {data.activity.slice(0, 5).map((a, i) => (
              <div key={a.id} className="activity-item">
                <span className={`activity-icon tone-${i % 4}`}>
                  {a.action.startsWith('ai') ? (
                    <Sparkles size={13} />
                  ) : a.action.startsWith('agent') ? (
                    <Bot size={13} />
                  ) : (
                    <CheckCheck size={13} />
                  )}
                </span>
                <div>
                  <p>{a.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>
                  <small>
                    {new Date(a.createdAt).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {typeof a.details.title === 'string' ? ` · ${a.details.title}` : ''}
                  </small>
                </div>
              </div>
            ))}
            {!data.activity.length && (
              <div className="empty-activity">
                <span className="pulse-orbit" />
                <p>Your story starts here.</p>
                <small>Real activity will appear as you work.</small>
              </div>
            )}
          </div>
          <button className="activity-link" onClick={() => navigate('Command Center')}>
            Explore command center
            <ArrowUpRight size={14} />
          </button>
        </section>
      </div>
      <div className="quick-strip">
        <span>
          <Command size={15} /> A little shortcut to your next move
        </span>
        <button onClick={() => navigate('Smart Planner')}>
          Plan my week
          <ArrowUpRight size={13} />
        </button>
        <button onClick={() => navigate('Voice Workspace')}>
          Think out loud
          <Mic size={13} />
        </button>
        <button onClick={() => navigate('AI Agents')}>
          Meet the crew
          <ArrowUpRight size={13} />
        </button>
      </div>
    </>
  );
}
export default function App() {
  const session = useSession();
  const [page, setPage] = useState('Dashboard');
  const [boardId, setBoardId] = useState('');
  const [filter, setFilter] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const prefs = usePreferences();
  const workspace = useQuery({
    queryKey: ['workspace'],
    queryFn: () => api<Workspace>('/workspace'),
    enabled: !!session.token,
    refetchInterval: 30000,
  });
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
  }, [prefs.reducedMotion]);
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);
  if (!session.token)
    return (
      <MotionConfig reducedMotion={prefs.reducedMotion ? 'always' : 'user'}>
        <Auth />
      </MotionConfig>
    );
  const navigate = (s: string, query?: string, targetBoardId?: string) => {
    if (query !== undefined) setFilter(query);
    if (targetBoardId) setBoardId(targetBoardId);
    setPage(s);
    setSidebar(false);
  };
  const data = workspace.data;
  const board = data?.boards.find((b) => b.id === boardId) || data?.boards[0];
  return (
    <MotionConfig reducedMotion={prefs.reducedMotion ? 'always' : 'user'}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {sidebar && (
          <button
            aria-label="Close navigation"
            className="sidebar-backdrop"
            onClick={() => setSidebar(false)}
          />
        )}
        <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
          <Brand />
          <div className="workspace-switch">
            <div className="workspace-symbol">
              S<span />
            </div>
            <div>
              <strong>My workspace</strong>
              <small>Personal space</small>
            </div>
            <span>⌘ K</span>
          </div>
          <span className="nav-label">WORKSPACE</span>
          <nav aria-label="Main navigation">
            {navigation.map(([name, Icon]) => (
              <button
                key={name}
                aria-label={name}
                className={page === name ? 'active' : ''}
                onClick={() => navigate(name)}
              >
                <Icon size={17} />
                <span>{name}</span>
                {name === 'AI Assistant' && <span className="nav-badge">AI</span>}
                {name === 'Kanban Projects' && data && (
                  <span className="nav-count">{data.boards.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-callout">
              <span className="spark-circle">✳</span>
              <h4>
                Think bigger.
                <br />
                Build together.
              </h4>
              <p>Your ideas have a home.</p>
              <button onClick={() => navigate('AI Assistant')}>
                Ask Samm
                <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="user-profile">
              <span className="avatar">{session.user.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{session.user.name}</strong>
                <small>Personal account</small>
              </div>
              <button
                aria-label="Log out"
                onClick={() => {
                  stopSpeech();
                  session.logout();
                  setPage('Dashboard');
                }}
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <button
              className="menu-toggle"
              aria-label="Toggle navigation"
              onClick={() => setSidebar(!sidebar)}
            >
              {sidebar ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
            </button>
            <div className="breadcrumb">
              Workspace
              <ChevronRight size={12} />
              <span>{page}</span>
            </div>
            <div className="top-search">
              <Search size={15} />
              <input
                aria-label="Search workspace tasks"
                placeholder="Search your workspace…"
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage('Kanban Projects');
                }}
              />
              <kbd>⌕</kbd>
            </div>
            <span className="top-status">
              <span className={`status-dot ${workspace.isError ? 'offline' : ''}`} />
              {workspace.isError
                ? 'Connection issue'
                : workspace.isFetching
                  ? 'Syncing'
                  : 'Workspace connected'}
            </span>
            <button
              className="icon-button theme-toggle"
              aria-label={prefs.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => prefs.set({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
            >
              {prefs.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="avatar small"
              aria-label="View profile"
              onClick={() => navigate('Settings')}
            >
              {session.user.name.slice(0, 1).toUpperCase()}
            </button>
          </header>
          <main id="main" className="main-content">
            {workspace.isLoading ? (
              <Loading />
            ) : workspace.error ? (
              <>
                <ErrorMessage message={workspace.error.message} />
                <Button onClick={() => void workspace.refetch()}>Retry connection</Button>
              </>
            ) : data ? (
              <Suspense fallback={<Loading />}>
                {page === 'Dashboard' ? (
                  <Dashboard data={data} navigate={navigate} />
                ) : page === 'Projects' ? (
                  <Projects data={data} navigate={navigate} />
                ) : page === 'Calendar' ? (
                  <Calendar data={data} navigate={navigate} />
                ) : page === 'Notifications' ? (
                  <Notifications data={data} navigate={navigate} />
                ) : page === 'Team Workspace' ? (
                  <Team data={data} />
                ) : page === 'Subscription' ? (
                  <Subscription />
                ) : page === 'Kanban Projects' ? (
                  <Kanban
                    data={data}
                    boardId={board?.id || ''}
                    setBoardId={setBoardId}
                    filter={filter}
                    setFilter={setFilter}
                  />
                ) : page === 'AI Assistant' || page === 'Voice Workspace' ? (
                  <Assistant
                    key={page}
                    data={data}
                    board={board}
                    voicePage={page === 'Voice Workspace'}
                    onNavigate={navigate}
                  />
                ) : page === 'AI Agents' ? (
                  <Agents data={data} board={board} />
                ) : page === 'Automations' ? (
                  <Automations board={board} />
                ) : page === 'Command Center' ? (
                  <CommandCenter />
                ) : page === 'Analytics' ? (
                  <Analytics data={data} />
                ) : page === 'Smart Planner' ? (
                  <Planner data={data} board={board} />
                ) : page === 'Files' ? (
                  <Files data={data} board={board} />
                ) : (
                  <Settings />
                )}
              </Suspense>
            ) : null}
          </main>
          <footer className="app-footer">
            <span>
              SAMMTECH AI OS <span className="muted">/</span> A little intelligence. A lot of
              possibility.
            </span>
            <span>
              MADE FOR YOUR NEXT BIG THING <span className="green">✳</span>
            </span>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}
