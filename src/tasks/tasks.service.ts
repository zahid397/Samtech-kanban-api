import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';

export const taskDetails = {
  labels: true,
  checklist: true,
  comments: { orderBy: { createdAt: 'asc' as const } },
  dependencies: true,
};
export function audit(
  tx: Prisma.TransactionClient,
  userId: string,
  action: string,
  entityId?: string,
  details: Prisma.InputJsonValue = {},
) {
  return tx.auditLog.create({ data: { userId, action, entityId, details } });
}
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}
  async owned(tx: Prisma.TransactionClient, userId: string, taskId: string) {
    const task = await tx.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { column: { include: { board: true } } },
    });
    if (!task || task.column.board.deletedAt) throw new NotFoundException('Task not found');
    if (task.column.board.userId !== userId) throw new ForbiddenException('Task access denied');
    return task;
  }
  async createIn(
    tx: Prisma.TransactionClient,
    userId: string,
    columnId: string,
    dto: CreateTaskDto,
  ) {
    const column = await tx.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });
    if (!column || column.board.deletedAt) throw new NotFoundException('Column not found');
    if (column.board.userId !== userId) throw new ForbiddenException('Column access denied');
    if (dto.assigneeId && dto.assigneeId !== userId)
      throw new BadRequestException('Only the board owner can be assigned');
    const position = await tx.task.count({ where: { columnId, deletedAt: null } });
    const task = await tx.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assigneeId: dto.assigneeId,
        columnId,
        position,
        completedAt: column.isDone ? new Date() : null,
        estimateMinutes: dto.estimateMinutes,
        labels: { create: dto.labels || [] },
        checklist: { create: dto.checklist || [] },
      },
      include: taskDetails,
    });
    await audit(tx, userId, 'task.created', task.id, { title: task.title });
    return task;
  }
  create(userId: string, columnId: string, dto: CreateTaskDto) {
    return this.prisma.write(userId, (tx) => this.createIn(tx, userId, columnId, dto));
  }
  update(userId: string, taskId: string, dto: UpdateTaskDto) {
    return this.prisma.write(userId, async (tx) => {
      await this.owned(tx, userId, taskId);
      if (dto.assigneeId && dto.assigneeId !== userId)
        throw new BadRequestException('Only the board owner can be assigned');
      const { labels, checklist, dueDate, ...fields } = dto;
      const task = await tx.task.update({
        where: { id: taskId },
        data: {
          ...fields,
          ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
          ...(labels && { labels: { deleteMany: {}, create: labels } }),
          ...(checklist && { checklist: { deleteMany: {}, create: checklist } }),
        },
        include: taskDetails,
      });
      await audit(tx, userId, 'task.updated', taskId);
      return task;
    });
  }
  remove(userId: string, taskId: string) {
    return this.prisma.write(userId, async (tx) => {
      const task = await this.owned(tx, userId, taskId);
      await tx.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
      await tx.task.updateMany({
        where: { columnId: task.columnId, deletedAt: null, position: { gt: task.position } },
        data: { position: { decrement: 1 } },
      });
      await audit(tx, userId, 'task.deleted', taskId);
      return { message: 'Task deleted successfully' };
    });
  }
  archived(userId: string) {
    return this.prisma.task.findMany({
      where: { deletedAt: { not: null }, column: { board: { userId, deletedAt: null } } },
      orderBy: { deletedAt: 'desc' },
      take: 200,
      include: {
        ...taskDetails,
        column: { select: { title: true, board: { select: { title: true } } } },
      },
    });
  }
  restore(userId: string, taskId: string) {
    return this.prisma.write(userId, async (tx) => {
      const task = await tx.task.findUnique({
        where: { id: taskId },
        include: { column: { include: { board: true } } },
      });
      if (!task || task.column.board.deletedAt) throw new NotFoundException('Task not found');
      if (task.column.board.userId !== userId) throw new ForbiddenException('Task access denied');
      if (!task.deletedAt) return task;
      const position = await tx.task.count({ where: { columnId: task.columnId, deletedAt: null } });
      const restored = await tx.task.update({
        where: { id: taskId },
        data: { deletedAt: null, position },
        include: taskDetails,
      });
      await audit(tx, userId, 'task.restored', taskId);
      return restored;
    });
  }
  move(userId: string, taskId: string, dto: MoveTaskDto) {
    return this.prisma.write(userId, async (tx) => {
      const task = await this.owned(tx, userId, taskId);
      const target = await tx.column.findUnique({
        where: { id: dto.targetColumnId },
        include: { board: true },
      });
      if (!target || target.board.deletedAt) throw new NotFoundException('Target column not found');
      if (target.boardId !== task.column.boardId)
        throw new BadRequestException('Tasks can only be moved within the same board');
      if (target.board.userId !== userId) throw new ForbiddenException('Column access denied');
      const count = await tx.task.count({
        where: { columnId: target.id, deletedAt: null, NOT: { id: taskId } },
      });
      const position = Math.max(0, Math.min(dto.newPosition, count));
      if (target.id === task.columnId) {
        if (position < task.position)
          await tx.task.updateMany({
            where: {
              columnId: task.columnId,
              deletedAt: null,
              position: { gte: position, lt: task.position },
            },
            data: { position: { increment: 1 } },
          });
        if (position > task.position)
          await tx.task.updateMany({
            where: {
              columnId: task.columnId,
              deletedAt: null,
              position: { gt: task.position, lte: position },
            },
            data: { position: { decrement: 1 } },
          });
      } else {
        await tx.task.updateMany({
          where: { columnId: task.columnId, deletedAt: null, position: { gt: task.position } },
          data: { position: { decrement: 1 } },
        });
        await tx.task.updateMany({
          where: { columnId: target.id, deletedAt: null, position: { gte: position } },
          data: { position: { increment: 1 } },
        });
      }
      const moved = await tx.task.update({
        where: { id: taskId },
        data: {
          columnId: target.id,
          position,
          completedAt: target.isDone ? task.completedAt || new Date() : null,
        },
        include: taskDetails,
      });
      await audit(tx, userId, 'task.moved', taskId, {
        from: task.columnId,
        to: target.id,
        position,
      });
      return moved;
    });
  }
  comment(userId: string, taskId: string, body: string) {
    return this.prisma.write(userId, async (tx) => {
      await this.owned(tx, userId, taskId);
      const comment = await tx.comment.create({ data: { taskId, authorId: userId, body } });
      await audit(tx, userId, 'task.commented', taskId);
      return comment;
    });
  }
  dependency(userId: string, taskId: string, dependsOnId: string, remove = false) {
    return this.prisma.write(userId, async (tx) => {
      const task = await this.owned(tx, userId, taskId);
      if (remove) {
        await tx.taskDependency.deleteMany({ where: { taskId, dependsOnId } });
      } else {
        const other = await this.owned(tx, userId, dependsOnId);
        if (task.column.boardId !== other.column.boardId || taskId === dependsOnId)
          throw new BadRequestException('Dependencies must be different tasks on the same board');
        const edges = await tx.taskDependency.findMany({
          where: { task: { column: { boardId: task.column.boardId } } },
        });
        const pending = [dependsOnId],
          seen = new Set<string>();
        while (pending.length) {
          const node = pending.pop()!;
          if (node === taskId) throw new BadRequestException('Dependency would create a cycle');
          if (seen.has(node)) continue;
          seen.add(node);
          pending.push(...edges.filter((e) => e.taskId === node).map((e) => e.dependsOnId));
        }
        await tx.taskDependency.upsert({
          where: { taskId_dependsOnId: { taskId, dependsOnId } },
          create: { taskId, dependsOnId },
          update: {},
        });
      }
      await audit(tx, userId, remove ? 'dependency.removed' : 'dependency.added', taskId, {
        dependsOnId,
      });
      return { ok: true };
    });
  }
}
