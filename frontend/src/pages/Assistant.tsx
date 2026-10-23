import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
  Check,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ErrorMessage, SectionTitle } from '../components/Primitives';
import { api, refresh, useSession } from '../lib/api';
import {
  SAMM_GREETING,
  speak,
  stopSpeech,
  useVoice,
  useSpeechStatus,
  voiceCapabilities,
} from '../lib/voice';
import { useMascot, usePreferences } from '../lib/store';
import type { AIResult, Board, Draft, Workspace } from '../lib/types';
import AssistantScene from '../components/AssistantScene';
import { workspaceCommand, type ReviewedTaskAction } from '../lib/assistantCommands';
import '../companion.css';
export function Result({ result, data }: { result: AIResult; data: Workspace }) {
  const title = (id: string) => data.tasks.find((t) => t.id === id)?.title || id;
  return (
    <div className="ai-result">
      {result.summary && <p>{result.summary}</p>}
      {result.drafts?.length && !result.proposalId ? (
        <div className="draft-summary">
          <h3>Suggested task drafts</h3>
          {result.drafts.map((d, i) => (
            <p key={i}>
              <strong>{d.title}</strong>
              <span className={`priority ${d.priority.toLowerCase()}`}>{d.priority}</span>
            </p>
          ))}
          <small>Copy a draft into a new task to review and save it.</small>
        </div>
      ) : null}
      {result.document && <pre>{result.document}</pre>}
      {result.plan && (
        <div className="plan-grid">
          {result.plan.map((day) => (
            <div key={day.date}>
              <span>
                {new Date(day.date + 'T12:00Z').toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
              <small>{day.minutes} min</small>
              {day.tasks.map((id) => (
                <p key={id}>{title(id)}</p>
              ))}
              {!day.tasks.length && <p className="muted">Open space</p>}
            </div>
          ))}
        </div>
      )}
      {result.unscheduled?.length ? (
        <p className="muted">
          Needs another week or prerequisite: {result.unscheduled.map(title).join(', ')}
        </p>
      ) : null}
      {result.matches?.map((m) => (
        <div className="result-row" key={m.taskId}>
          <span>{title(m.taskId)}</span>
          <small>
            {m.method} · {Math.round(m.score * 100)}%
          </small>
        </div>
      ))}
      {result.recommendations?.slice(0, 5).map((r) => (
        <div className="result-row" key={r.taskId}>
          <span>
            {title(r.taskId)}
            <small>{r.reason}</small>
          </span>
          <span className={`priority ${r.priority.toLowerCase()}`}>{r.priority}</span>
        </div>
      ))}
      {result.checks?.map((c) => (
        <div key={c.taskId}>
          <strong>{title(c.taskId)}</strong>
          <ul>
            {c.checks.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      ))}
      {result.explanations?.length ? (
        <details>
          <summary>How this recommendation was made</summary>
          <ul>
            {result.explanations.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="mode-note">
        {result.mode === 'local'
          ? 'Local model'
          : result.mode === 'neon'
            ? 'Neon AI Gateway'
            : result.mode === 'lightweight'
              ? 'Lightweight algorithms'
              : 'AI analysis'}{' '}
        · {result.engine}
      </p>
    </div>
  );
}
interface ConversationEntry {
  role: 'user' | 'assistant';
  text: string;
  time: string;
}
function readConversation(key: string): ConversationEntry[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (x) =>
              ['user', 'assistant'].includes(x?.role) &&
              typeof x.text === 'string' &&
              typeof x.time === 'string',
          )
          .slice(-40)
          .map((x) => ({ ...x, text: x.text.slice(0, 4000) }))
      : [];
  } catch {
    return [];
  }
}
function VoiceSignal({
  listening,
  level,
  local,
}: {
  listening: boolean;
  level: number;
  local: boolean;
}) {
  const mouth = useMascot((s) => s.mouth);
  const state = useMascot((s) => s.state);
  const active = listening || state === 'speaking';
  const measured = local && listening;
  const amplitude = measured ? level : state === 'speaking' ? mouth : 0;
  return (
    <div
      className={`companion-signal ${active ? 'active' : ''} ${listening && !local ? 'recognition-pulse' : ''}`}
      role="img"
      aria-label={
        measured
          ? 'Measured local microphone level'
          : listening
            ? 'Browser recognition listening indicator; audio amplitude is unavailable'
            : state === 'speaking'
              ? 'Approximate speech playback activity'
              : 'Microphone and playback are idle'
      }
    >
      {Array.from({ length: 15 }, (_, i) => (
        <i
          key={i}
          style={{
            height: `${5 + amplitude * (12 + (7 - Math.abs(7 - i)) * 4)}px`,
            animationDelay: `${i * 65}ms`,
          }}
        />
      ))}
    </div>
  );
}
export default function Assistant({
  data,
  board,
  voicePage = false,
  onNavigate,
}: {
  data: Workspace;
  board?: Board;
  voicePage?: boolean;
  onNavigate?: (page: string, query?: string, boardId?: string) => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AIResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reviewAction, setReviewAction] = useState<ReviewedTaskAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [columnId, setColumnId] = useState('');
  const [kind, setKind] = useState('interpret');
  const controller = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const voice = usePreferences((s) => s.voice);
  const localVoice = usePreferences((s) => s.localVoice);
  const setPrefs = usePreferences((s) => s.set);
  const speech = useSpeechStatus();
  const mascotState = useMascot((s) => s.state);
  const email = useSession((s) => s.user.email);
  const historyKey = `sammtech-conversation:${encodeURIComponent(email)}`;
  const [history, setHistory] = useState<ConversationEntry[]>(() => readConversation(historyKey));
  const addHistory = (role: ConversationEntry['role'], value: string) =>
    setHistory((previous) => {
      const next = [
        ...previous,
        { role, text: value.slice(0, 4000), time: new Date().toISOString() },
      ].slice(-40);
      try {
        sessionStorage.setItem(historyKey, JSON.stringify(next));
      } catch {
        /* Text history remains available in memory when tab storage is unavailable. */
      }
      return next;
    });
  const reply = (value: string, say = true) => {
    setMessage(value);
    addHistory('assistant', value);
    if (say) void speak(value);
  };
  useEffect(
    () => () => {
      requestNumber.current++;
      controller.current?.abort();
    },
    [],
  );
  const interpret = async (input = text, spoken = false) => {
    if (!input.trim() || saving) return;
    addHistory('user', input);
    if (/^(yes|confirm|approve)[.! ]*$/i.test(input) && (result?.proposalId || reviewAction)) {
      reply(
        'Please review the proposed details and press the approval button. A recognized voice or typed “yes” does not authorize a workspace change.',
      );
      return;
    }
    if (/^cancel[.! ]*$/i.test(input)) {
      cancel();
      return;
    }
    controller.current?.abort();
    const current = ++requestNumber.current;
    setError('');
    setMessage('');
    setResult(null);
    setDrafts([]);
    setReviewAction(null);
    if (/^(?:help|what can you do)[?.! ]*$/i.test(input)) {
      reply(
        'I can draft tasks, summarize your project, search tasks, list pending work and deadlines, and prepare changes for review. Try: Move “Fix Login Bug” to “In Progress”. Every saved change needs an explicit approval button.',
      );
      return;
    }
    if (/^(?:explain|help with) (?:the |this |my )?(?:last )?error[?.! ]*$/i.test(input)) {
      reply(
        error
          ? `The previous request failed: ${error} Check the service connection and your access, then retry. No successful update was confirmed.`
          : 'There is no current assistant error to explain. If a request fails, its actual error will appear here.',
      );
      return;
    }
    const command = workspaceCommand(input, data, board);
    if (command) {
      if (command.kind === 'review') setReviewAction(command.action);
      if (command.kind === 'clarify') useMascot.getState().event('CONFUSE');
      if (command.kind === 'navigate' && onNavigate)
        onNavigate(command.page, command.query, command.boardId);
      reply(
        command.kind === 'navigate' && !onNavigate
          ? command.message.replace(/^Opening/, 'Use the navigation to open')
          : command.message,
      );
      return;
    }
    const operation = /summari[sz]e|project progress|today.?s work/i.test(input)
      ? 'summary'
      : /^(?:search|find) tasks?\b/i.test(input)
        ? 'search'
        : /recommend.*priorit|analy[sz]e.*workload/i.test(input)
          ? 'analyze'
          : kind;
    setKind(operation);
    setBusy(true);
    useMascot.getState().event('THINK');
    controller.current = new AbortController();
    try {
      const r = await api<AIResult>(
        '/ai/interpret',
        'POST',
        { text: input, boardId: board?.id, kind: operation },
        controller.current.signal,
      );
      if (current !== requestNumber.current) return;
      setResult(r);
      setDrafts(r.drafts || []);
      setColumnId(board?.columns[0]?.id || '');
      useMascot.getState().event('REST');
      const answer =
        r.message ||
        r.summary ||
        (r.drafts?.length
          ? `Prepared ${r.drafts.length} task draft${r.drafts.length === 1 ? '' : 's'} for your review. Press Approve & create when the details are correct.`
          : 'Your analysis is ready.');
      reply(answer);
      await refresh();
    } catch (e) {
      if (current === requestNumber.current && (e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        addHistory('assistant', `Request failed: ${(e as Error).message}`);
        useMascot.getState().event('FAIL');
      }
    } finally {
      if (current === requestNumber.current) setBusy(false);
    }
    // Speech follows the same analysis and review flow as typed input.
    void spoken;
  };
  const approve = async () => {
    if (busy || (!reviewAction && (!result?.proposalId || !columnId))) return;
    setBusy(true);
    setSaving(true);
    useMascot.getState().event('THINK');
    setError('');
    try {
      if (reviewAction) {
        const action = reviewAction;
        if (action.kind === 'move')
          await api(`/tasks/${action.task.id}/position`, 'PATCH', {
            targetColumnId: action.columnId,
            newPosition: action.newPosition,
          });
        else await api(`/tasks/${action.task.id}`, 'PATCH', action.changes);
        await refresh();
        setReviewAction(null);
        reply(
          action.kind === 'move'
            ? `Done! “${action.task.title}” has been moved to ${action.destination} and saved.`
            : `Done! The update to “${action.task.title}” has been saved.`,
        );
      } else {
        await api(`/ai/proposals/${result!.proposalId}/approve`, 'POST', {
          approved: true,
          columnId,
          drafts,
        });
        await refresh();
        setDrafts([]);
        setResult({ ...result!, proposalId: undefined, drafts: [] });
        reply('Done! Your tasks have been created and saved.');
      }
      useMascot.getState().event('COMPLETE');
    } catch (e) {
      setError((e as Error).message);
      addHistory('assistant', `Save failed: ${(e as Error).message}`);
      useMascot.getState().event('FAIL');
    } finally {
      setBusy(false);
      setSaving(false);
    }
  };
  const mic = useVoice((input) => {
    setText(input);
    void interpret(input, true);
  });
  const cancel = () => {
    if (saving) return;
    requestNumber.current++;
    controller.current?.abort();
    mic.cancel();
    stopSpeech();
    setBusy(false);
    setDrafts([]);
    setResult(null);
    setReviewAction(null);
    reply('Cancelled. No task change was submitted.', false);
  };
  const capabilities = voiceCapabilities();
  const greeting = () => {
    setPrefs({ voice: true });
    reply(SAMM_GREETING);
  };
  return (
    <>
      <SectionTitle
        eyebrow={voicePage ? 'A WORKSPACE THAT LISTENS' : 'YOUR THINKING PARTNER'}
        title={voicePage ? 'Say it. Shape it.' : 'A little help. A big head start.'}
        description="Turn a thought into a plan. You always make the final call."
      />
      <section className="glass companion-stage" aria-label="Samm companion">
        <div className="companion-stage-scene">
          <AssistantScene />
        </div>
        <div className="companion-stage-copy">
          <span className="eyebrow">YOUR WORKSPACE COMPANION</span>
          <h2>
            A little intelligence.
            <br />
            <span className="green">A lot of possibility.</span>
          </h2>
          <p>Speak an idea, explore your work, or prepare your next move.</p>
          <div className="companion-stage-actions">
            <Button type="button" variant="outline" onClick={greeting}>
              <Volume2 size={16} />
              Say hello
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={stopSpeech}
              disabled={!['loading', 'speaking'].includes(speech.status)}
            >
              <Square size={15} />
              Stop speaking
            </Button>
            <span className="companion-state">
              <i className="status-dot" />
              Samm is {mascotState}
            </span>
          </div>
          <VoiceSignal listening={mic.listening} level={mic.level} local={localVoice} />
          <small className="muted">
            {localVoice
              ? 'Local recording: audio is sent to your configured speech service after Stop.'
              : capabilities.recognition
                ? 'Browser recognition available · English · processing may use your browser vendor’s service.'
                : 'Browser speech recognition unavailable · typed input is ready.'}
          </small>
          {!capabilities.synthesis && !localVoice && (
            <p className="muted">
              Browser speech output is unavailable. Replies remain visible as text.
            </p>
          )}
        </div>
      </section>
      <div className="assistant-layout">
        <section className="glass assistant-panel">
          <div className="assistant-top">
            <div className="assistant-avatar">
              <Sparkles size={24} />
            </div>
            <div>
              <h3>Samm, at your service</h3>
              <p>Python intelligence · Approval before action</p>
            </div>
            <button
              className="icon-button"
              onClick={() => {
                setPrefs({ voice: !voice });
                if (voice) stopSpeech();
              }}
              aria-label={voice ? 'Mute assistant' : 'Enable assistant voice'}
            >
              {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
          <div className="conversation">
            <p className="intro-message">
              Good ideas deserve a place to start.
              <br />
              <strong>What shall we build today?</strong>
            </p>
            <div className="suggestion-grid">
              {[
                'Create a task called Fix Login Bug by tomorrow',
                'Show my pending tasks',
                'Summarize my project',
              ].map((suggestion, i) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setText(suggestion);
                    setKind(i === 2 ? 'summary' : 'interpret');
                  }}
                >
                  {suggestion}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            {message && (
              <div className="assistant-message" role="status">
                <Sparkles size={16} />
                <span style={{ whiteSpace: 'pre-wrap' }}>{message}</span>
              </div>
            )}
            <ErrorMessage message={error || mic.error || speech.error} />
            {(error || mic.error) && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy || !text.trim()}
                onClick={() => void interpret()}
              >
                Retry typed request
              </Button>
            )}
            {result && <Result result={result} data={data} />}
            <details className="companion-history">
              <summary>Conversation history ({history.length})</summary>
              <p className="muted">
                Up to 40 text messages stay in this signed-in browser tab. No audio recordings are
                stored. Clear the transcript whenever you need.
              </p>
              <Button
                type="button"
                variant="ghost"
                disabled={!history.length}
                onClick={() => {
                  setHistory([]);
                  sessionStorage.removeItem(historyKey);
                }}
              >
                Clear conversation
              </Button>
              <ol aria-label="Conversation transcript" tabIndex={0}>
                {history.map((entry, i) => (
                  <li key={`${entry.time}-${i}`} className={entry.role}>
                    <small>
                      {entry.role === 'user' ? 'You' : 'Samm'} ·{' '}
                      {new Date(entry.time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                    <p>{entry.text}</p>
                  </li>
                ))}
              </ol>
            </details>
          </div>
          <form
            className="command-input"
            onSubmit={(e) => {
              e.preventDefault();
              void interpret();
            }}
          >
            <div className="assistant-options">
              <select
                aria-label="Assistant operation"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="interpret">Draft a task</option>
                <option value="plan">Plan a project / week</option>
                <option value="summary">Project summary</option>
                <option value="search">Search tasks</option>
                <option value="analyze">Analyze workload</option>
              </select>
              <span>{board?.title || 'Select a project first'}</span>
            </div>
            <textarea
              aria-label="Ask Samm"
              placeholder={
                mic.listening ? 'Listening…' : 'Ask Samm to plan, find, or create something…'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={3}
            />
            <div className="input-bottom">
              <span>
                <i className="status-dot" />
                {saving
                  ? 'Saving…'
                  : busy
                    ? 'Thinking…'
                    : mic.listening
                      ? 'Microphone is on'
                      : speech.status === 'speaking'
                        ? 'Samm is speaking'
                        : 'Ready when you are'}
              </span>
              <div>
                <Button
                  type="button"
                  variant={mic.listening ? 'danger' : 'ghost'}
                  size="icon"
                  aria-label={mic.listening ? 'Stop microphone' : 'Start microphone'}
                  disabled={saving || busy}
                  onClick={() => (mic.listening ? mic.stop() : void mic.start())}
                >
                  {mic.listening ? <Square size={17} /> : <Mic size={18} />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cancel request"
                  disabled={saving}
                  onClick={cancel}
                >
                  <X size={17} />
                </Button>
                <Button size="icon" aria-label="Send request" disabled={busy || !text.trim()}>
                  <Send size={17} />
                </Button>
              </div>
            </div>
            <div className="companion-push-row">
              <Button
                type="button"
                variant="ghost"
                className="push-to-talk"
                disabled={busy || saving}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  void mic.start();
                }}
                onPointerUp={() => mic.stop()}
                onPointerCancel={mic.cancel}
                onKeyDown={(e) => {
                  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
                    e.preventDefault();
                    void mic.start();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault();
                    mic.stop();
                  }
                }}
                onBlur={() => {
                  if (mic.listening) mic.stop();
                }}
              >
                <Mic size={15} />
                Hold to talk
              </Button>
              <small className="muted">
                Hold pointer, Space, or Enter. Release to finish. You can always type.
              </small>
            </div>
          </form>
        </section>
        <aside className="glass review-panel">
          <span className="eyebrow">THE FINAL WORD IS YOURS</span>
          <h2>
            Review & approve<span className="green">.</span>
          </h2>
          {reviewAction ? (
            <>
              <p className="muted">This change has not been saved.</p>
              <div className="draft-card">
                <h3>{reviewAction.task.title}</h3>
                <p>
                  {reviewAction.kind === 'move'
                    ? `Move to ${reviewAction.destination}`
                    : reviewAction.description}
                </p>
              </div>
              <Button className="full" disabled={busy} onClick={() => void approve()}>
                <Check size={17} />
                {saving
                  ? 'Saving…'
                  : reviewAction.kind === 'move'
                    ? 'Approve move'
                    : 'Approve update'}
              </Button>
              <Button className="full" variant="ghost" disabled={saving} onClick={cancel}>
                Discard change
              </Button>
            </>
          ) : drafts.length && result?.proposalId ? (
            <>
              <p className="muted">Check the details. These tasks haven’t been saved yet.</p>
              {drafts.map((draft, i) => (
                <div className="draft-card" key={i}>
                  <label>
                    Title
                    <input
                      value={draft.title}
                      maxLength={150}
                      onChange={(e) =>
                        setDrafts(
                          drafts.map((d, j) => (j === i ? { ...d, title: e.target.value } : d)),
                        )
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Priority
                      <select
                        value={draft.priority}
                        onChange={(e) =>
                          setDrafts(
                            drafts.map((d, j) =>
                              j === i ? { ...d, priority: e.target.value as Draft['priority'] } : d,
                            ),
                          )
                        }
                      >
                        {['LOW', 'MEDIUM', 'HIGH'].map((priority) => (
                          <option key={priority}>{priority}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Due date (UTC)
                      <input
                        type="date"
                        value={draft.dueDate?.slice(0, 10) || ''}
                        onChange={(e) =>
                          setDrafts(
                            drafts.map((d, j) =>
                              j === i
                                ? {
                                    ...d,
                                    dueDate: e.target.value ? e.target.value + 'T17:00:00Z' : null,
                                  }
                                : d,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <label>
                Destination
                <select value={columnId} onChange={(e) => setColumnId(e.target.value)}>
                  {board?.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                className="full"
                disabled={busy || !columnId || drafts.some((d) => !d.title.trim())}
                onClick={() => void approve()}
              >
                <Check size={17} />
                {saving ? 'Saving…' : 'Approve & create'}
              </Button>
              <Button className="full" variant="ghost" disabled={saving} onClick={cancel}>
                Discard draft
              </Button>
            </>
          ) : (
            <div className="review-empty">
              <div className="orbit-icon">
                <Check size={24} />
              </div>
              <h3>A thoughtful pause.</h3>
              <p>
                Your task drafts and proposed changes appear here. Review them before anything
                changes.
              </p>
            </div>
          )}
          <div className="privacy-note">
            <span>YOUR WORKSPACE. YOUR CONTROL.</span>
            <p>
              No commercial AI key required. Lightweight mode uses explainable algorithms. Voice
              recordings aren’t stored by the application. Recognized speech never approves a
              database update.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
