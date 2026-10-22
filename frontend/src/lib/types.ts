export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export interface Draft {
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string | null;
  estimateMinutes?: number;
  assigneeId?: string | null;
  labels?: { name: string; color: string }[];
  checklist?: { title: string; done: boolean }[];
}
export interface Task extends Draft {
  id: string;
  columnId: string;
  position: number;
  completedAt: string | null;
  createdAt: string;
  comments: { id: string; body: string; createdAt: string }[];
  dependencies: { dependsOnId: string }[];
}
export interface Column {
  id: string;
  title: string;
  order: number;
  isDone: boolean;
  tasks: Task[];
}
export interface Board {
  id: string;
  title: string;
  columns: Column[];
}
export interface Audit {
  id: string;
  action: string;
  entityId: string;
  createdAt: string;
  details: Record<string, unknown>;
}
export interface AgentRun {
  id: string;
  agent: string;
  status: string;
  result: AIResult | null;
  error: string | null;
  createdAt: string;
}
export interface Rule {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  frequencyHours: number;
  nextRunAt: string;
  runs: { id: string; status: string; result: unknown; error?: string; createdAt: string }[];
}
export interface Workspace {
  boards: Board[];
  tasks: Task[];
  activity: Audit[];
  agents: AgentRun[];
  automations: Rule[];
  metrics: {
    boards: number;
    tasks: number;
    completed: number;
    overdue: number;
    upcoming: number;
    workloadMinutes: number;
    priorities: { priority: string; count: number }[];
    trend: { date: string; completed: number }[];
  };
}
export interface AIResult {
  proposalId?: string;
  message?: string;
  mode: string;
  engine: string;
  summary?: string;
  drafts?: Draft[];
  explanations?: string[];
  plan?: { date: string; tasks: string[]; minutes: number }[];
  unscheduled?: string[];
  recommendations?: { taskId: string; priority: string; reason: string }[];
  matches?: { taskId: string; score: number; method: string }[];
  document?: string;
  checks?: { taskId: string; checks: string[] }[];
  suggestedDependencies?: { taskId: string; dependsOnId: string; reason: string }[];
}
