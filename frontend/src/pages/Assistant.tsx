import { useRef, useState } from 'react';
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
import { api, refresh } from '../lib/api';
import { speak, stopSpeech, useVoice } from '../lib/voice';
import { useMascot, usePreferences } from '../lib/store';
import type { AIResult, Board, Draft, Workspace } from '../lib/types';
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
        {result.mode === 'local' ? 'Local model' : 'Lightweight algorithms'} · {result.engine}
      </p>
    </div>
  );
}
export default function Assistant({
  data,
  board,
  voicePage = false,
}: {
  data: Workspace;
  board?: Board;
  voicePage?: boolean;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AIResult | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [columnId, setColumnId] = useState('');
  const [kind, setKind] = useState('interpret');
  const controller = useRef<AbortController | null>(null);
  const voice = usePreferences((s) => s.voice);
  const setPrefs = usePreferences((s) => s.set);
  const interpret = async (input = text) => {
    if (!input.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    setResult(null);
    setDrafts([]);
    useMascot.getState().event('THINK');
    controller.current = new AbortController();
    try {
      const r = await api<AIResult>(
        '/ai/interpret',
        'POST',
        { text: input, boardId: board?.id, kind },
        controller.current.signal,
      );
      setResult(r);
      setDrafts(r.drafts || []);
      setColumnId(board?.columns[0]?.id || '');
      setMessage(r.message || 'Your analysis is ready.');
      useMascot.getState().event('REST');
      void speak(r.message || r.summary || 'Your analysis is ready.');
      await refresh();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message);
        useMascot.getState().event('FAIL');
      }
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    if (!result?.proposalId || !columnId || busy) return;
    setBusy(true);
    setSaving(true);
    setError('');
    try {
      await api(`/ai/proposals/${result.proposalId}/approve`, 'POST', {
        approved: true,
        columnId,
        drafts,
      });
      await refresh();
      setDrafts([]);
      setResult({ ...result, proposalId: undefined, drafts: [] });
      setMessage('Done! Your tasks have been created and saved.');
      useMascot.getState().event('COMPLETE');
      void speak(
        drafts.length === 1
          ? 'Done! The task has been created.'
          : 'Done! Your tasks have been created.',
      );
    } catch (e) {
      setError((e as Error).message);
      useMascot.getState().event('FAIL');
    } finally {
      setBusy(false);
      setSaving(false);
    }
  };
  const mic = useVoice((input) => {
    setText(input);
    if (/^yes[.! ]*$/i.test(input) && result?.proposalId && drafts.length) {
      void approve();
    } else if (/^cancel[.! ]*$/i.test(input)) {
      setDrafts([]);
      setResult(null);
      setMessage('Draft cancelled.');
    } else {
      void interpret(input);
    }
  });
  const cancel = () => {
    if (saving) return;
    controller.current?.abort();
    mic.cancel();
    stopSpeech();
    setBusy(false);
    setDrafts([]);
    setResult(null);
    setMessage('Cancelled. No draft was submitted.');
  };
  return (
    <>
      <SectionTitle
        eyebrow={voicePage ? 'A WORKSPACE THAT LISTENS' : 'YOUR THINKING PARTNER'}
        title={voicePage ? 'Say it. Shape it.' : 'A little help. A big head start.'}
        description="Turn a thought into a plan. You always make the final call."
      />
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
                'Plan a website launch',
                'Summarize my project',
              ].map((s, i) => (
                <button
                  key={s}
                  onClick={() => {
                    setText(s);
                    setKind(i === 1 ? 'plan' : i === 2 ? 'summary' : 'interpret');
                  }}
                >
                  {s}
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
            {message && (
              <div className="assistant-message" role="status">
                <Sparkles size={16} />
                <span>{message}</span>
              </div>
            )}
            <ErrorMessage message={error || mic.error} />
            {result && <Result result={result} data={data} />}
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
                <i className="status-dot" />{' '}
                {saving
                  ? 'Saving…'
                  : busy
                    ? 'Thinking…'
                    : mic.listening
                      ? 'Microphone is on'
                      : 'Ready when you are'}
              </span>
              <div>
                <Button
                  type="button"
                  variant={mic.listening ? 'danger' : 'ghost'}
                  size="icon"
                  aria-label={mic.listening ? 'Stop microphone' : 'Start microphone'}
                  disabled={saving}
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
          </form>
        </section>
        <aside className="glass review-panel">
          <span className="eyebrow">THE FINAL WORD IS YOURS</span>
          <h2>
            Review & approve<span className="green">.</span>
          </h2>
          {drafts.length && result?.proposalId ? (
            <>
              <p className="muted">Check the details. These tasks haven’t been saved yet.</p>
              {drafts.map((d, i) => (
                <div className="draft-card" key={i}>
                  <label>
                    Title
                    <input
                      value={d.title}
                      maxLength={150}
                      onChange={(e) =>
                        setDrafts(
                          drafts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                        )
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Priority
                      <select
                        value={d.priority}
                        onChange={(e) =>
                          setDrafts(
                            drafts.map((x, j) =>
                              j === i ? { ...x, priority: e.target.value as Draft['priority'] } : x,
                            ),
                          )
                        }
                      >
                        {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Due date (UTC)
                      <input
                        type="date"
                        value={d.dueDate?.slice(0, 10) || ''}
                        onChange={(e) =>
                          setDrafts(
                            drafts.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    dueDate: e.target.value ? e.target.value + 'T17:00:00Z' : null,
                                  }
                                : x,
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
                  {board?.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
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
                {busy ? 'Saving…' : 'Approve & create'}
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
              <p>Your task drafts will appear here. Review them before anything changes.</p>
            </div>
          )}
          <div className="privacy-note">
            <span>YOUR WORKSPACE. YOUR CONTROL.</span>
            <p>
              No commercial AI key required. Lightweight mode uses explainable algorithms. Voice
              recordings aren’t stored by the application.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
