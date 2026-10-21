import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  CalendarDays,
  GripVertical,
  MessageSquare,
  CheckCheck,
  Search,
  Download,
  Trash2,
  ArrowRight,
  Link2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Empty, ErrorMessage, Modal, SectionTitle } from '../components/Primitives';
import { api, refresh } from '../lib/api';
import { download, niceDate } from '../lib/utils';
import type { Board, Column, Draft, Task, Workspace } from '../lib/types';
import { useMascot } from '../lib/store';
function TaskCard({ task, onEdit }: { task: Task; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="task-card"
    >
      <div className="task-top">
        <span className={`priority ${task.priority.toLowerCase()}`}>
          {task.priority.toLowerCase()}
        </span>
        <button
          {...attributes}
          {...listeners}
          className="drag-handle"
          aria-label={`Drag ${task.title}`}
        >
          <GripVertical size={15} />
        </button>
      </div>
      <button className="task-title" onClick={onEdit}>
        {task.title}
      </button>
      {task.description && <p className="task-excerpt">{task.description}</p>}
      <div className="labels">
        {task.labels?.map((l, i) => (
          <span key={i} style={{ color: l.color, background: l.color + '15' }}>
            {l.name}
          </span>
        ))}
      </div>
      <footer>
        <span
          className={
            task.dueDate && !task.completedAt && new Date(task.dueDate) < new Date()
              ? 'text-danger'
              : ''
          }
        >
          <CalendarDays size={12} />
          {niceDate(task.dueDate)}
        </span>
        <span>
          {task.checklist?.length ? (
            <>
              <CheckCheck size={12} />
              {task.checklist.filter((x) => x.done).length}/{task.checklist.length}
            </>
          ) : null}
          {task.comments?.length ? (
            <>
              <MessageSquare size={12} />
              {task.comments.length}
            </>
          ) : null}
        </span>
      </footer>
    </article>
  );
}
function Lane({
  column,
  tasks,
  onEdit,
  onAdd,
}: {
  column: Column;
  tasks: Task[];
  onEdit: (t: Task) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} className={`kanban-lane ${isOver ? 'drop-over' : ''}`}>
      <header>
        <span className={`column-dot ${column.isDone ? 'done' : ''}`} />
        <h3>{column.title}</h3>
        <span className="count">{tasks.length}</span>
        <button onClick={onAdd} aria-label={`Add task to ${column.title}`}>
          <Plus size={16} />
        </button>
      </header>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onEdit={() => onEdit(t)} />
        ))}
      </SortableContext>
      {!tasks.length && (
        <button className="empty-lane" onClick={onAdd}>
          + Make room for an idea
        </button>
      )}
    </section>
  );
}
export function TaskEditor({
  task,
  board,
  columnId,
  onClose,
}: {
  task?: Task;
  board: Board;
  columnId: string;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    task
      ? {
          title: task.title,
          description: task.description || '',
          priority: task.priority,
          dueDate: task.dueDate,
          estimateMinutes: task.estimateMinutes,
          labels: task.labels,
          checklist: task.checklist?.map((x) => ({ title: x.title, done: x.done })),
        }
      : {
          title: '',
          description: '',
          priority: 'MEDIUM',
          estimateMinutes: 60,
          labels: [],
          checklist: [],
        },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [check, setCheck] = useState('');
  const [dependency, setDependency] = useState('');
  const [destination, setDestination] = useState(columnId);
  const action = async (fn: () => Promise<unknown>, close = false) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
      if (close) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () =>
    action(async () => {
      const payload = { ...draft, dueDate: draft.dueDate || null };
      await api(
        task ? `/tasks/${task.id}` : `/columns/${columnId}/tasks`,
        task ? 'PATCH' : 'POST',
        payload,
      );
      if (task && destination !== task.columnId)
        await api(`/tasks/${task.id}/position`, 'PATCH', {
          targetColumnId: destination,
          newPosition: board.columns.find((c) => c.id === destination)?.tasks.length || 0,
        });
      useMascot.getState().event('COMPLETE');
    }, true);
  return (
    <Modal title={task ? 'Task details' : 'A new possibility'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="form-grid"
      >
        {!task && (
          <label>
            Start with a template
            <select
              defaultValue=""
              onChange={(e) => {
                const templates: Record<string, Draft> = {
                  bug: {
                    title: 'Fix a bug',
                    description: 'Observed behavior:\n\nExpected behavior:\n\nSteps to reproduce:',
                    priority: 'HIGH',
                    estimateMinutes: 60,
                    labels: [{ name: '🐛 Bug', color: '#ffa68b' }],
                    checklist: [
                      { title: 'Reproduce the issue', done: false },
                      { title: 'Fix and test', done: false },
                    ],
                  },
                  design: {
                    title: 'Design a new experience',
                    description: 'Goal:\n\nUsers and constraints:',
                    priority: 'MEDIUM',
                    estimateMinutes: 120,
                    labels: [{ name: '🎨 Design', color: '#c0a2ff' }],
                    checklist: [
                      { title: 'Explore concepts', done: false },
                      { title: 'Review accessibility', done: false },
                    ],
                  },
                  research: {
                    title: 'Research an idea',
                    description: 'Question:\n\nEvidence:\n\nRecommendation:',
                    priority: 'MEDIUM',
                    estimateMinutes: 90,
                    labels: [{ name: '💡 Idea', color: '#f5d77c' }],
                    checklist: [
                      { title: 'Gather sources', done: false },
                      { title: 'Record findings', done: false },
                    ],
                  },
                };
                if (templates[e.target.value]) setDraft(templates[e.target.value]);
              }}
            >
              <option value="">Blank task</option>
              <option value="bug">🐛 Bug report</option>
              <option value="design">🎨 Design task</option>
              <option value="research">💡 Research brief</option>
            </select>
          </label>
        )}
        <label>
          Task title
          <input
            required
            maxLength={150}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="What would you like to build?"
            autoFocus
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            maxLength={10000}
            value={draft.description || ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            Priority
            <select
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.target.value as Draft['priority'] })
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
              value={draft.dueDate?.slice(0, 10) || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  dueDate: e.target.value ? e.target.value + 'T17:00:00Z' : null,
                })
              }
            />
          </label>
          <label>
            Minutes
            <input
              type="number"
              min={5}
              max={480}
              value={draft.estimateMinutes || 60}
              onChange={(e) => setDraft({ ...draft, estimateMinutes: Number(e.target.value) })}
            />
          </label>
        </div>
        {task && (
          <label>
            Move to column
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <span className="field-title">Labels</span>
          <div className="labels">
            {['🐛 Bug', '🎨 Design', '🚀 Launch', '💡 Idea', '📚 Docs'].map((name, i) => (
              <button
                type="button"
                key={name}
                className={draft.labels?.some((l) => l.name === name) ? 'selected' : ''}
                onClick={() =>
                  setDraft({
                    ...draft,
                    labels: draft.labels?.some((l) => l.name === name)
                      ? draft.labels.filter((l) => l.name !== name)
                      : [
                          ...(draft.labels || []),
                          {
                            name,
                            color: ['#ffa68b', '#c0a2ff', '#b5ef75', '#f5d77c', '#87c4f1'][i],
                          },
                        ],
                  })
                }
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-title">Checklist / subtasks</span>
          {draft.checklist?.map((item, i) => (
            <label className="check-row" key={i}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    checklist: draft.checklist?.map((x, j) =>
                      j === i ? { ...x, done: e.target.checked } : x,
                    ),
                  })
                }
              />
              {item.title}
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, checklist: draft.checklist?.filter((_, j) => i !== j) })
                }
                aria-label={`Remove ${item.title}`}
              >
                <Trash2 size={12} />
              </button>
            </label>
          ))}
          <div className="inline-form">
            <input
              aria-label="Checklist item"
              placeholder="Break it into a smaller step"
              value={check}
              onChange={(e) => setCheck(e.target.value)}
              maxLength={200}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (check.trim())
                  setDraft({
                    ...draft,
                    checklist: [...(draft.checklist || []), { title: check.trim(), done: false }],
                  });
                setCheck('');
              }}
            >
              Add
            </Button>
          </div>
        </div>
        <ErrorMessage message={error} />
        <div className="modal-actions">
          {task && (
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (window.confirm('Delete this task? It will be archived.'))
                  void action(() => api(`/tasks/${task.id}`, 'DELETE'), true);
              }}
              disabled={busy}
            >
              <Trash2 size={15} />
            </Button>
          )}
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !draft.title.trim()}>
            {busy ? 'Saving…' : 'Save task'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </form>
      {task && (
        <div className="task-extras">
          <h3>
            <MessageSquare size={16} /> Comments
          </h3>
          {task.comments.map((c) => (
            <p className="comment" key={c.id}>
              {c.body}
              <small>{niceDate(c.createdAt)}</small>
            </p>
          ))}
          <div className="inline-form">
            <input
              aria-label="Comment"
              value={comment}
              maxLength={4000}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Leave a note"
            />
            <Button
              variant="outline"
              disabled={!comment.trim() || busy}
              onClick={() =>
                void action(async () => {
                  await api(`/tasks/${task.id}/comments`, 'POST', { body: comment });
                  setComment('');
                })
              }
            >
              Post
            </Button>
          </div>
          <h3>
            <Link2 size={16} /> Dependencies
          </h3>
          {task.dependencies.map((d) => (
            <div className="dependency" key={d.dependsOnId}>
              {board.columns.flatMap((c) => c.tasks).find((t) => t.id === d.dependsOnId)?.title ||
                'Archived prerequisite'}
              <button
                onClick={() =>
                  void action(() =>
                    api(`/tasks/${task.id}/dependencies/${d.dependsOnId}`, 'DELETE'),
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div className="inline-form">
            <select
              aria-label="Prerequisite task"
              value={dependency}
              onChange={(e) => setDependency(e.target.value)}
            >
              <option value="">Select a prerequisite</option>
              {board.columns
                .flatMap((c) => c.tasks)
                .filter((t) => t.id !== task.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <Button
              variant="outline"
              disabled={!dependency || busy}
              onClick={() =>
                void action(() =>
                  api(`/tasks/${task.id}/dependencies`, 'POST', { dependsOnId: dependency }),
                )
              }
            >
              Link
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
export default function Kanban({
  data,
  boardId,
  setBoardId,
  filter,
  setFilter,
}: {
  data: Workspace;
  boardId: string;
  setBoardId: (id: string) => void;
  filter: string;
  setFilter: (s: string) => void;
}) {
  const board = data.boards.find((b) => b.id === boardId) || data.boards[0];
  const [editing, setEditing] = useState<{ id?: string; columnId: string } | null>(null);
  const [newBoard, setNewBoard] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = async (e: DragEndEvent) => {
    if (!e.over || !board || filter || priority) return;
    const source = board.columns.flatMap((c) => c.tasks).find((t) => t.id === e.active.id);
    if (!source) return;
    const targetTask = board.columns.flatMap((c) => c.tasks).find((t) => t.id === e.over!.id);
    const targetColumn = board.columns.find(
      (c) => c.id === e.over!.id || c.id === targetTask?.columnId,
    );
    if (!targetColumn) return;
    try {
      await api(`/tasks/${source.id}/position`, 'PATCH', {
        targetColumnId: targetColumn.id,
        newPosition: targetTask ? targetTask.position : targetColumn.tasks.length,
      });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <>
      <SectionTitle
        eyebrow="TURN IDEAS INTO MOMENTUM"
        title="Your next big thing"
        description="A little structure. A lot of possibility."
        action={
          <Button onClick={() => setNewBoard(true)}>
            <Plus size={16} />
            New project
          </Button>
        }
      />
      <div className="workspace-toolbar">
        <select
          aria-label="Project"
          value={board?.id || ''}
          onChange={(e) => setBoardId(e.target.value)}
        >
          {data.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search tasks"
            placeholder="Find a task…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <select
          aria-label="Priority filter"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">All priorities</option>
          {['HIGH', 'MEDIUM', 'LOW'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        {board && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => download('sammtech-project.json', JSON.stringify(board, null, 2))}
            >
              <Download size={14} />
              Export
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Archive board"
              onClick={async () => {
                if (window.confirm(`Archive ${board.title}?`)) {
                  try {
                    await api(`/boards/${board.id}`, 'DELETE');
                    await refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }
              }}
            >
              <Trash2 size={15} />
            </Button>
          </>
        )}
      </div>
      <ErrorMessage message={error} />
      {(filter || priority) && (
        <p className="muted">Clear filters to reorder tasks. Open a task to change its column.</p>
      )}
      {board ? (
        <DndContext sensors={sensors} onDragEnd={move}>
          <div className="kanban-grid">
            {board.columns.map((c) => (
              <Lane
                key={c.id}
                column={c}
                tasks={c.tasks.filter(
                  (t) =>
                    t.title.toLowerCase().includes(filter.toLowerCase()) &&
                    (!priority || t.priority === priority),
                )}
                onEdit={(t) => setEditing({ id: t.id, columnId: c.id })}
                onAdd={() => setEditing({ columnId: c.id })}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <Empty
          title="Every big thing starts with a board"
          action={<Button onClick={() => setNewBoard(true)}>Create your first project</Button>}
        >
          Create a project to get five ready-to-use columns.
        </Empty>
      )}
      {editing && board && (
        <TaskEditor
          task={board.columns.flatMap((c) => c.tasks).find((t) => t.id === editing.id)}
          columnId={editing.columnId}
          board={board}
          onClose={() => setEditing(null)}
        />
      )}{' '}
      {newBoard && (
        <Modal title="Create a project" onClose={() => setNewBoard(false)}>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const b = await api<Board>('/boards', 'POST', { title });
                await refresh();
                setBoardId(b.id);
                setNewBoard(false);
                setTitle('');
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Project name
              <input
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Something worth building"
                autoFocus
              />
            </label>
            <p className="muted">Backlog → Todo → In Progress → Review → Done</p>
            <ErrorMessage message={error} />
            <Button disabled={busy || !title.trim()}>
              {busy ? 'Creating…' : 'Create project'}
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
