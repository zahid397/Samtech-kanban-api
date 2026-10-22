import type { Board, Task, Workspace } from './types';

export type ReviewedTaskAction =
  | { kind: 'move'; task: Task; destination: string; columnId: string; newPosition: number }
  | {
      kind: 'update';
      task: Task;
      description: string;
      changes: { title?: string; priority?: 'LOW' | 'MEDIUM' | 'HIGH'; dueDate?: string };
    };
export type WorkspaceCommand =
  | { kind: 'navigate'; page: string; query?: string; boardId?: string; message: string }
  | { kind: 'read'; message: string }
  | { kind: 'review'; action: ReviewedTaskAction; message: string }
  | { kind: 'clarify'; message: string };

/** Named application commands operate only on the signed-in workspace snapshot. */
export function workspaceCommand(
  input: string,
  data: Workspace,
  board?: Board,
): WorkspaceCommand | null {
  const text = input.trim();
  const normalized = text.toLowerCase().replace(/[.!?]+$/, '');
  if (/^(hello|hi|hey)( samm(tech)?)?$/.test(normalized))
    return {
      kind: 'read',
      message: "Hello! I'm Samm, your AI workspace assistant. How can I help you today?",
    };
  const pages: Record<string, string> = {
    dashboard: 'Dashboard',
    projects: 'Kanban Projects',
    kanban: 'Kanban Projects',
    analytics: 'Analytics',
    calendar: 'Smart Planner',
    planner: 'Smart Planner',
    automations: 'Automations',
    files: 'Files',
    settings: 'Settings',
    agents: 'AI Agents',
  };
  const navigation =
    /^(?:open|go to|show) (?:my |the )?(dashboard|projects|kanban|analytics|calendar|planner|automations|files|settings|agents)$/.exec(
      normalized,
    );
  if (navigation)
    return {
      kind: 'navigate',
      page: pages[navigation[1]],
      message: `Opening ${pages[navigation[1]]}.`,
    };
  if (/^(?:show|list) (?:my )?(?:pending|open|unfinished) tasks$/.test(normalized)) {
    const tasks = data.tasks.filter((t) => !t.completedAt);
    return {
      kind: 'read',
      message: tasks.length
        ? `${tasks.length} pending tasks:\n${tasks
            .slice(0, 20)
            .map((t) => `• ${t.title} · ${t.priority.toLowerCase()}`)
            .join('\n')}${tasks.length > 20 ? '\nOpen Kanban to see every task.' : ''}`
        : 'You have no pending tasks in this workspace.',
    };
  }
  if (/^(?:show|list|explain|what are) (?:my )?(?:upcoming |next )?deadlines$/.test(normalized)) {
    const cutoff = Date.now() + 7 * 86400000;
    const tasks = data.tasks
      .filter((t) => !t.completedAt && t.dueDate && new Date(t.dueDate).getTime() <= cutoff)
      .sort((a, b) => Date.parse(a.dueDate!) - Date.parse(b.dueDate!));
    return {
      kind: 'read',
      message: tasks.length
        ? `Open deadlines through the next 7 days (including overdue):\n${tasks
            .slice(0, 20)
            .map((t) => `• ${t.title} · ${new Date(t.dueDate!).toLocaleString()}`)
            .join('\n')}`
        : 'No open deadlines are due within the next 7 days.',
    };
  }
  const project = /^(?:find|open) project [“"]?(.+?)[”"]?$/i.exec(text);
  if (project) {
    const needle = project[1].toLowerCase();
    const matches = data.boards.filter((b) => b.title.toLowerCase().includes(needle));
    if (matches.length === 1)
      return {
        kind: 'navigate',
        page: 'Kanban Projects',
        boardId: matches[0].id,
        message: `Opening project ${matches[0].title}.`,
      };
    return {
      kind: 'clarify',
      message: matches.length
        ? `Please give a more specific project name. Matches: ${matches.map((b) => b.title).join(', ')}.`
        : `I couldn't find an authorized project called ${project[1]}.`,
    };
  }
  const move = /^move [“"]([^”"]+)[”"] to [“"]?(.+?)[”"]?\.?$/i.exec(text);
  const priority =
    /^(?:set|update) (?:the )?priority (?:of|for) [“"]([^”"]+)[”"] to (low|medium|high)\.?$/i.exec(
      text,
    );
  const rename = /^rename [“"]([^”"]+)[”"] to [“"]([^”"]+)[”"]\.?$/i.exec(text);
  const deadline =
    /^set (?:the )?due date (?:of|for) [“"]([^”"]+)[”"] to (\d{4}-\d{2}-\d{2})\.?$/i.exec(text);
  const action = move || priority || rename || deadline;
  if (action) {
    const matches = data.tasks.filter((t) => t.title.toLowerCase() === action[1].toLowerCase());
    if (matches.length !== 1)
      return {
        kind: 'clarify',
        message: matches.length
          ? 'Several tasks have that title. Open Task Details to select the exact task safely.'
          : `I couldn't find an authorized task with the exact title “${action[1]}”.`,
      };
    const task = matches[0];
    if (move) {
      const ownerBoard = data.boards.find((b) => b.columns.some((c) => c.id === task.columnId));
      const columns =
        ownerBoard?.columns.filter((c) => c.title.toLowerCase() === move[2].toLowerCase()) || [];
      if (columns.length !== 1)
        return {
          kind: 'clarify',
          message: `Use an exact column name in the task's project: ${ownerBoard?.columns.map((c) => c.title).join(', ') || board?.title || 'open Task Details'}.`,
        };
      if (task.columnId === columns[0].id)
        return { kind: 'read', message: `“${task.title}” is already in ${columns[0].title}.` };
      return {
        kind: 'review',
        action: {
          kind: 'move',
          task,
          destination: columns[0].title,
          columnId: columns[0].id,
          newPosition: columns[0].tasks.length,
        },
        message: `Review moving “${task.title}” to ${columns[0].title}. Nothing has been changed yet.`,
      };
    }
    const changes: { title?: string; priority?: 'LOW' | 'MEDIUM' | 'HIGH'; dueDate?: string } = {};
    let description = '';
    if (priority) {
      changes.priority = priority[2].toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';
      description = `Set priority to ${priority[2]}`;
    }
    if (rename) {
      if (!rename[2].trim() || rename[2].trim().length > 150)
        return { kind: 'clarify', message: 'The new title must contain 1–150 characters.' };
      changes.title = rename[2].trim();
      description = `Rename to “${changes.title}”`;
    }
    if (deadline) {
      const date = new Date(`${deadline[2]}T17:00:00Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== deadline[2])
        return { kind: 'clarify', message: 'Please provide a valid due date as YYYY-MM-DD.' };
      changes.dueDate = date.toISOString();
      description = `Set due date to ${deadline[2]} at 17:00 UTC`;
    }
    return {
      kind: 'review',
      action: { kind: 'update', task, description, changes },
      message: `Review the update to “${task.title}”. Nothing has been changed yet.`,
    };
  }
  if (/^(move|rename|set (?:the )?(priority|due date)|update (?:the )?priority)\b/i.test(text))
    return {
      kind: 'clarify',
      message:
        'Use an exact quoted task title, for example: Move “Fix Login Bug” to “In Progress”, Rename “Old title” to “New title”, or Set priority of “Fix Login Bug” to high. I will prepare a change for your review.',
    };
  if (/^(delete|remove|archive)\b/i.test(text))
    return {
      kind: 'clarify',
      message:
        'Open the task or project details to review destructive changes. Samm will not delete or archive anything from speech alone.',
    };
  return null;
}
