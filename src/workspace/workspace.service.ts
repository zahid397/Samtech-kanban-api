import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, audit, taskDetails } from '../tasks/tasks.service';
import { Prisma } from '@prisma/client';
import { IntelligenceDto, ApproveDto, AgentDto, FileDto, ImportDto } from './workspace.dto';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
const AGENT_KINDS: Record<string, string> = {
  planner: 'plan',
  'task-manager': 'analyze',
  research: 'research',
  documentation: 'documentation',
  analyst: 'analyze',
  qa: 'qa',
  automation: 'automation',
};
@Injectable()
export class WorkspaceService {
  private readonly active = new Map<string, AbortController>();
  constructor(
    private readonly db: PrismaService,
    private readonly tasks: TasksService,
  ) {}
  async snapshot(userId: string, boardId?: string) {
    if (
      boardId &&
      !(await this.db.board.findFirst({ where: { id: boardId, userId, deletedAt: null } }))
    )
      throw new NotFoundException('Board not found');
    const boards = await this.db.board.findMany({
      where: { userId, deletedAt: null, ...(boardId ? { id: boardId } : {}) },
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              where: { deletedAt: null },
              orderBy: { position: 'asc' },
              include: taskDetails,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return boards;
  }
  async dashboard(userId: string) {
    const boards = await this.snapshot(userId);
    const tasks = boards.flatMap((b) => b.columns.flatMap((c) => c.tasks));
    const open = tasks.filter((t) => !t.completedAt);
    const now = new Date();
    const [activity, agents, rules] = await Promise.all([
      this.db.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.db.agentRun.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.db.automationRule.findMany({
        where: { userId },
        include: { runs: { orderBy: { createdAt: 'desc' }, take: 10 } },
      }),
    ]);
    const trend = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now);
      day.setUTCDate(day.getUTCDate() - 6 + i);
      const date = day.toISOString().slice(0, 10);
      return {
        date,
        completed: tasks.filter((t) => t.completedAt?.toISOString().startsWith(date)).length,
      };
    });
    return {
      boards,
      tasks,
      activity,
      agents,
      automations: rules,
      metrics: {
        boards: boards.length,
        tasks: tasks.length,
        completed: tasks.length - open.length,
        overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
        workloadMinutes: open.reduce((s, t) => s + t.estimateMinutes, 0),
        upcoming: open.filter(
          (t) => t.dueDate && t.dueDate >= now && +t.dueDate < +now + 7 * 86400000,
        ).length,
        priorities: ['LOW', 'MEDIUM', 'HIGH'].map((priority) => ({
          priority,
          count: open.filter((t) => t.priority === priority).length,
        })),
        trend,
      },
    };
  }
  async gateway(path: string, body: unknown, signal?: AbortSignal) {
    const url = process.env.AI_ENGINE_URL;
    const key = process.env.AI_SERVICE_KEY;
    if (!url || !key)
      throw new ServiceUnavailableException(
        'Python intelligence is not configured. Kanban remains available.',
      );
    try {
      const response = await fetch(new URL(path, url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-key': key },
        body: JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(50000)])
          : AbortSignal.timeout(50000),
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('AI request failed');
      }
      const maxBytes = path === '/voice/speak' ? 12_000_000 : 2_000_000;
      const advertisedSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(advertisedSize) && advertisedSize > maxBytes) {
        await response.body?.cancel();
        throw new Error('AI response too large');
      }
      if (!response.body) throw new Error('Empty AI response');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel('AI response limit exceeded');
            throw new Error('AI response too large');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } catch {
      throw new ServiceUnavailableException(
        'Python service unavailable or request cancelled. No tasks were created.',
      );
    }
  }
  async health() {
    let database = 'unavailable';
    try {
      await this.db.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      /*report unavailable*/
    }
    let ai: unknown = { status: 'not-configured' };
    if (process.env.AI_ENGINE_URL)
      try {
        const response = await fetch(new URL('/health', process.env.AI_ENGINE_URL), {
          signal: AbortSignal.timeout(4000),
          redirect: 'error',
        });
        ai = response.ok ? await response.json() : { status: 'unavailable' };
      } catch {
        ai = { status: 'unavailable' };
      }
    return {
      api: 'ok',
      database,
      ai,
      scheduler:
        process.env.AUTOMATION_WORKER_ENABLED === 'true'
          ? 'enabled-while-running'
          : 'external-or-manual',
    };
  }
  async analyze(userId: string, dto: IntelligenceDto, signal?: AbortSignal) {
    const boards = await this.snapshot(userId, dto.boardId);
    const all = boards.flatMap((b) => b.columns.flatMap((c) => c.tasks));
    if (all.length > 1000)
      throw new BadRequestException('Select a board with at most 1000 tasks for analysis');
    const tasks = all.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dueDate: t.dueDate?.toISOString() || null,
      completedAt: t.completedAt?.toISOString() || null,
      estimateMinutes: t.estimateMinutes,
      dependsOn: t.dependencies.map((d) => d.dependsOnId),
    }));
    const result = await this.gateway(
      '/analyze',
      {
        text: dto.text,
        tasks,
        kind: dto.kind || 'interpret',
        capacityMinutes: dto.capacityMinutes || 360,
      },
      signal,
    );
    if (!result || typeof result !== 'object' || !['lightweight', 'local'].includes(result.mode))
      throw new ServiceUnavailableException('Invalid AI response');
    if (result.drafts !== undefined) {
      try {
        result.drafts = await this.validatedDrafts(result.drafts, true);
      } catch {
        throw new ServiceUnavailableException('AI returned invalid task drafts');
      }
    }
    return result;
  }
  async propose(userId: string, dto: IntelligenceDto) {
    const result = await this.analyze(userId, dto);
    let proposalId: string | undefined;
    if (result.drafts?.length) {
      if (!dto.boardId) throw new BadRequestException('Select a board before drafting tasks');
      const p = await this.db.aiProposal.create({
        data: {
          userId,
          boardId: dto.boardId,
          result,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      proposalId = p.id;
    }
    await this.db.auditLog.create({
      data: {
        userId,
        action: 'ai.analyzed',
        details: { kind: dto.kind || 'interpret', mode: result.mode },
      },
    });
    return { ...result, proposalId };
  }
  approve(userId: string, id: string, dto: ApproveDto) {
    return this.db.write(userId, async (tx) => {
      const proposal = await tx.aiProposal.findFirst({ where: { id, userId } });
      if (!proposal) throw new NotFoundException('Proposal not found');
      if (proposal.appliedAt) return { taskIds: proposal.taskIds, alreadyApplied: true };
      if (proposal.expiresAt < new Date())
        throw new BadRequestException('Proposal expired; request a new draft');
      const column = await tx.column.findFirst({
        where: { id: dto.columnId, boardId: proposal.boardId, board: { userId, deletedAt: null } },
      });
      if (!column) throw new NotFoundException('Column not found');
      if (dto.approved !== true) throw new BadRequestException('Explicit approval is required');
      const drafts = await this.validatedDrafts(dto.drafts ?? (proposal.result as any).drafts);
      const created = [];
      for (const draft of drafts)
        created.push(await this.tasks.createIn(tx, userId, column.id, draft));
      const taskIds = created.map((t) => t.id);
      await tx.aiProposal.update({ where: { id }, data: { appliedAt: new Date(), taskIds } });
      await audit(tx, userId, 'ai.proposal.approved', id, { taskIds });
      return { tasks: created, taskIds, alreadyApplied: false };
    });
  }
  private async validatedDrafts(value: unknown, allowEmpty = false): Promise<CreateTaskDto[]> {
    if (!Array.isArray(value) || value.length > 8 || (!allowEmpty && value.length === 0))
      throw new BadRequestException('Expected one to eight task drafts');
    const drafts: CreateTaskDto[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        throw new BadRequestException('Invalid task draft');
      const draft = plainToInstance(CreateTaskDto, item);
      try {
        await validateOrReject(draft, {
          whitelist: true,
          forbidNonWhitelisted: true,
          forbidUnknownValues: true,
        });
      } catch {
        throw new BadRequestException('Invalid task draft');
      }
      drafts.push(draft);
    }
    return drafts;
  }
  async agents(userId: string) {
    await this.db.write(userId, async (tx) => {
      const expired = await tx.agentRun.findMany({
        where: { userId, status: 'running', createdAt: { lt: new Date(Date.now() - 120000) } },
        select: { id: true },
      });
      if (expired.length) {
        await tx.agentRun.updateMany({
          where: { id: { in: expired.map((run) => run.id) }, status: 'running' },
          data: {
            status: 'failed',
            error: 'Execution expired or worker restarted',
            finishedAt: new Date(),
          },
        });
        for (const run of expired)
          await audit(tx, userId, 'agent.failed', run.id, { reason: 'expired' });
      }
    });
    return this.db.agentRun.findMany({
      where: { userId },
      take: 40,
      orderBy: { createdAt: 'desc' },
    });
  }
  async runAgent(userId: string, dto: AgentDto) {
    await this.snapshot(userId, dto.boardId);
    const run = await this.db.write(userId, async (tx) => {
      if (
        (await tx.agentRun.count({
          where: { userId, status: 'running', createdAt: { gt: new Date(Date.now() - 120000) } },
        })) >= 2
      )
        throw new BadRequestException('At most two agent runs may execute at once');
      const run = await tx.agentRun.create({ data: { userId, agent: dto.agent } });
      await audit(tx, userId, 'agent.started', run.id, { agent: dto.agent });
      return run;
    });
    const controller = new AbortController();
    this.active.set(run.id, controller);
    void this.finishAgent(userId, run.id, { ...dto, kind: AGENT_KINDS[dto.agent] }, controller);
    return run;
  }
  private async finishAgent(
    userId: string,
    id: string,
    dto: AgentDto,
    controller: AbortController,
  ) {
    let status = 'completed',
      result: Prisma.InputJsonValue | undefined,
      error: string | undefined;
    try {
      result = await this.analyze(userId, dto, controller.signal);
    } catch {
      status = 'failed';
      error = 'Agent failed or timed out; no data was modified.';
    } finally {
      this.active.delete(id);
    }
    await this.db
      .write(userId, async (tx) => {
        const changed = await tx.agentRun.updateMany({
          where: { id, userId, status: 'running' },
          data: { status, result, error, finishedAt: new Date() },
        });
        if (changed.count) await audit(tx, userId, `agent.${status}`, id);
      })
      .catch(() => undefined);
  }
  async cancelAgent(userId: string, id: string) {
    await this.db.write(userId, async (tx) => {
      const run = await tx.agentRun.findFirst({ where: { id, userId } });
      if (!run) throw new NotFoundException('Agent run not found');
      if (run.status === 'running') {
        await tx.agentRun.update({
          where: { id },
          data: { status: 'cancelled', finishedAt: new Date() },
        });
        await audit(tx, userId, 'agent.cancelled', id);
      }
    });
    this.active.get(id)?.abort();
    return { ok: true };
  }
  async command(userId: string, command: string) {
    const data = await this.dashboard(userId);
    let result: unknown;
    switch (command) {
      case 'help':
        result = [
          'help',
          'boards list',
          'tasks today',
          'tasks overdue',
          'project summarize',
          'agent status',
          'automation list',
          'health',
        ];
        break;
      case 'boards list':
        result = data.boards.map((b) => ({ id: b.id, title: b.title }));
        break;
      case 'tasks today':
        result = data.tasks.filter(
          (t) =>
            !t.completedAt &&
            t.dueDate?.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10),
        );
        break;
      case 'tasks overdue':
        result = data.tasks.filter((t) => !t.completedAt && t.dueDate && t.dueDate < new Date());
        break;
      case 'project summarize':
        result = data.metrics;
        break;
      case 'agent status':
        result = await this.agents(userId);
        break;
      case 'automation list':
        result = data.automations;
        break;
      case 'health':
        result = await this.health();
        break;
      default:
        throw new BadRequestException('Unsupported application command');
    }
    await this.db.auditLog.create({
      data: { userId, action: 'command.executed', details: { command } },
    });
    return { command, result, executedAt: new Date() };
  }
  files(userId: string) {
    return this.db.workspaceFile.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });
  }
  async file(userId: string, id: string) {
    const file = await this.db.workspaceFile.findFirst({ where: { id, userId } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }
  saveFile(userId: string, dto: FileDto) {
    return this.db.write(userId, async (tx) => {
      if ((await tx.workspaceFile.count({ where: { userId } })) >= 100)
        throw new BadRequestException('Workspace limit: 100 text files');
      const f = await tx.workspaceFile.create({ data: { userId, ...dto } });
      await audit(tx, userId, 'file.created', f.id);
      return f;
    });
  }
  importTasks(userId: string, dto: ImportDto) {
    return this.db.write(userId, async (tx) => {
      const created = [];
      for (const task of dto.tasks)
        created.push(await this.tasks.createIn(tx, userId, dto.columnId, task));
      return created;
    });
  }
}
