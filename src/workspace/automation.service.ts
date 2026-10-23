import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService, audit } from '../tasks/tasks.service';
import { AutomationDto } from './workspace.dto';
@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private logger = new Logger('Automations');
  constructor(
    private readonly db: PrismaService,
    private readonly tasks: TasksService,
  ) {}
  onModuleInit() {
    if (process.env.AUTOMATION_WORKER_ENABLED === 'true')
      this.timer = setInterval(
        () => void this.tick().catch(() => this.logger.warn('Automation tick failed')),
        60000,
      );
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async create(userId: string, dto: AutomationDto) {
    return this.db.write(userId, async (tx) => {
      if (dto.approved !== true) throw new BadRequestException('Explicit approval is required');
      if ((await tx.automationRule.count({ where: { userId } })) >= 50)
        throw new BadRequestException('Maximum 50 rules');
      if (
        dto.boardId &&
        !(await tx.board.findFirst({ where: { id: dto.boardId, userId, deletedAt: null } }))
      )
        throw new NotFoundException('Board not found');
      if (dto.kind === 'recurring-task' && (!dto.task || !dto.columnId))
        throw new BadRequestException(
          'Recurring tasks require a task template and destination column',
        );
      if (
        dto.columnId &&
        !(await tx.column.findFirst({
          where: {
            id: dto.columnId,
            ...(dto.boardId ? { boardId: dto.boardId } : {}),
            board: { userId, deletedAt: null },
          },
        }))
      )
        throw new NotFoundException('Column not found on the selected board');
      const rule = await tx.automationRule.create({
        data: {
          userId,
          name: dto.name,
          kind: dto.kind,
          frequencyHours: dto.frequencyHours,
          config: JSON.parse(
            JSON.stringify({
              boardId: dto.boardId,
              columnId: dto.columnId,
              task: dto.task,
              condition: dto.condition || 'always',
            }),
          ),
        },
      });
      await audit(tx, userId, 'automation.created', rule.id, { kind: dto.kind, approved: true });
      return rule;
    });
  }
  list(userId: string) {
    return this.db.automationRule.findMany({
      where: { userId },
      include: { runs: { take: 10, orderBy: { createdAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  toggle(userId: string, id: string, enabled: boolean) {
    return this.db.write(userId, async (tx) => {
      const r = await tx.automationRule.findFirst({ where: { id, userId } });
      if (!r) throw new NotFoundException('Rule not found');
      const rule = await tx.automationRule.update({ where: { id }, data: { enabled } });
      await audit(tx, userId, 'automation.toggled', id, { enabled });
      return rule;
    });
  }
  async tick(userId?: string) {
    if (this.busy) return { executed: 0 };
    this.busy = true;
    let executed = 0;
    try {
      const rules = await this.db.automationRule.findMany({
        where: { enabled: true, nextRunAt: { lte: new Date() }, ...(userId ? { userId } : {}) },
        take: 50,
        orderBy: { nextRunAt: 'asc' },
      });
      for (const rule of rules) {
        try {
          const done = await this.db.write(rule.userId, async (tx) => {
            const current = await tx.automationRule.findUnique({ where: { id: rule.id } });
            if (!current?.enabled || current.nextRunAt > new Date()) return false;
            const cfg = current.config as any;
            if (
              cfg.boardId &&
              !(await tx.board.findFirst({
                where: { id: cfg.boardId, userId: current.userId, deletedAt: null },
              }))
            )
              throw new Error('Board unavailable');
            const tasks = await tx.task.findMany({
              where: {
                deletedAt: null,
                column: {
                  board: {
                    userId: current.userId,
                    deletedAt: null,
                    ...(cfg.boardId ? { id: cfg.boardId } : {}),
                  },
                },
              },
              include: { dependencies: { include: { dependsOn: true } } },
              take: 1000,
            });
            const open = tasks.filter((t) => !t.completedAt),
              overdue = open.filter((t) => t.dueDate && t.dueDate < new Date());
            const skip =
              (cfg.condition === 'has-overdue' && !overdue.length) ||
              (cfg.condition === 'has-open' && !open.length);
            let result: any = {
              total: tasks.length,
              open: open.length,
              overdue: overdue.map((t) => ({ id: t.id, title: t.title })),
              completed: tasks.length - open.length,
            };
            if (!skip && current.kind === 'recurring-task') {
              const t = await this.tasks.createIn(tx, current.userId, cfg.columnId, cfg.task);
              result = { taskId: t.id, title: t.title };
            }
            if (current.kind === 'due-reminder')
              result = {
                tasks: open
                  .filter(
                    (t) =>
                      t.dueDate && +t.dueDate >= Date.now() && +t.dueDate < Date.now() + 86400000,
                  )
                  .map((t) => ({ id: t.id, title: t.title })),
              };
            if (current.kind === 'dependency-notification')
              result = {
                ready: open
                  .filter(
                    (t) =>
                      t.dependencies.length &&
                      t.dependencies.every(
                        (d) => d.dependsOn.completedAt && !d.dependsOn.deletedAt,
                      ),
                  )
                  .map((t) => t.id),
              };
            if (current.kind === 'next-actions')
              result = {
                tasks: open
                  .filter((t) =>
                    t.dependencies.every((d) => d.dependsOn.completedAt && !d.dependsOn.deletedAt),
                  )
                  .sort(
                    (a, b) =>
                      ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[a.priority] -
                      { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.priority],
                  )
                  .slice(0, 5)
                  .map((t) => ({ id: t.id, title: t.title })),
              };
            await tx.automationRun.create({
              data: {
                ruleId: current.id,
                scheduledFor: current.nextRunAt,
                status: skip ? 'skipped' : 'completed',
                result,
              },
            });
            // Coalesce missed schedules after sleeping; never create an unbounded backlog.
            await tx.automationRule.update({
              where: { id: current.id },
              data: { nextRunAt: new Date(Date.now() + current.frequencyHours * 3600000) },
            });
            await audit(tx, current.userId, 'automation.executed', current.id, {
              kind: current.kind,
              status: skip ? 'skipped' : 'completed',
            });
            return true;
          });
          if (done) executed++;
        } catch {
          await this.db.write(rule.userId, async (tx) => {
            const r = await tx.automationRule.findUnique({ where: { id: rule.id } });
            if (!r || +r.nextRunAt !== +rule.nextRunAt) return;
            await tx.automationRun.upsert({
              where: { ruleId_scheduledFor: { ruleId: rule.id, scheduledFor: rule.nextRunAt } },
              create: {
                ruleId: rule.id,
                scheduledFor: rule.nextRunAt,
                status: 'failed',
                error: 'Execution failed; verify destination and permissions.',
              },
              update: {},
            });
            await tx.automationRule.update({
              where: { id: rule.id },
              data: { nextRunAt: new Date(Date.now() + rule.frequencyHours * 3600000) },
            });
            await audit(tx, rule.userId, 'automation.failed', rule.id);
          });
        }
      }
      return { executed };
    } finally {
      this.busy = false;
    }
  }
}
