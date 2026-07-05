import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, columnId: string, dto: CreateTaskDto) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });

    if (!column || column.board.deletedAt) {
      throw new NotFoundException('Column not found');
    }
    if (column.board.userId !== userId) {
      throw new ForbiddenException('You do not have access to this column');
    }
    if (dto.assigneeId) {
      await this.assertAssigneeExists(dto.assigneeId);
    }

    const lastTask = await this.prisma.task.findFirst({
      where: { columnId, deletedAt: null },
      orderBy: { position: 'desc' },
    });
    const position = lastTask ? lastTask.position + 1 : 0;

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeId: dto.assigneeId,
        columnId,
        position,
      },
    });
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await this.findActiveTaskOrThrow(taskId);
    this.assertOwnership(task, userId);

    if (dto.assigneeId) {
      await this.assertAssigneeExists(dto.assigneeId);
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      },
    });
  }

  async remove(userId: string, taskId: string) {
    const task = await this.findActiveTaskOrThrow(taskId);
    this.assertOwnership(task, userId);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Task deleted successfully' };
  }

  /**
   * Moves a task within its current column (reorder) or into a different
   * column on the same board (transfer + reorder). Runs entirely inside one
   * Prisma interactive transaction so a crash mid-shift can never leave two
   * tasks sharing a position or a gap in the sequence.
   *
   * Positions are plain contiguous integers per column (0, 1, 2, ...) rather
   * than sparse/fractional keys — simpler to reason about and to display,
   * at the cost of an update to every task between the old and new spot
   * instead of touching just one row. For typical Kanban column sizes
   * that trade-off is the right one. Full write-up in README > Key
   * Technical Decisions.
   */
  async move(userId: string, taskId: string, dto: MoveTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, deletedAt: null },
        include: { column: { include: { board: true } } },
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }
      if (task.column.board.userId !== userId) {
        throw new ForbiddenException('You do not have access to this task');
      }

      const targetColumn = await tx.column.findUnique({
        where: { id: dto.targetColumnId },
        include: { board: true },
      });

      if (!targetColumn) {
        throw new NotFoundException('Target column not found');
      }
      if (targetColumn.boardId !== task.column.boardId) {
        throw new BadRequestException('Tasks can only be moved within the same board');
      }
      if (targetColumn.board.userId !== userId) {
        throw new ForbiddenException('You do not have access to the target column');
      }

      const sourceColumnId = task.columnId;
      const targetColumnId = dto.targetColumnId;
      const isSameColumn = sourceColumnId === targetColumnId;

      // Clamp newPosition into the valid range for the target column so a
      // client can't push a task past the end of the list or to a negative
      // index.
      const taskCountInTarget = await tx.task.count({
        where: isSameColumn
          ? { columnId: targetColumnId, deletedAt: null, NOT: { id: taskId } }
          : { columnId: targetColumnId, deletedAt: null },
      });
      const newPosition = Math.max(0, Math.min(dto.newPosition, taskCountInTarget));

      if (isSameColumn) {
        const oldPosition = task.position;
        if (newPosition === oldPosition) {
          return task;
        }

        if (newPosition < oldPosition) {
          // Task moved up: everything between the new spot and the old spot
          // shifts down by one to make room.
          await tx.task.updateMany({
            where: {
              columnId: sourceColumnId,
              deletedAt: null,
              position: { gte: newPosition, lt: oldPosition },
            },
            data: { position: { increment: 1 } },
          });
        } else {
          // Task moved down: everything between the old spot and the new
          // spot shifts up by one to close the gap.
          await tx.task.updateMany({
            where: {
              columnId: sourceColumnId,
              deletedAt: null,
              position: { gt: oldPosition, lte: newPosition },
            },
            data: { position: { decrement: 1 } },
          });
        }

        return tx.task.update({ where: { id: taskId }, data: { position: newPosition } });
      }

      // Cross-column move: close the gap left behind in the source column,
      // then open a gap at the destination, then relocate the task itself.
      await tx.task.updateMany({
        where: { columnId: sourceColumnId, deletedAt: null, position: { gt: task.position } },
        data: { position: { decrement: 1 } },
      });

      await tx.task.updateMany({
        where: { columnId: targetColumnId, deletedAt: null, position: { gte: newPosition } },
        data: { position: { increment: 1 } },
      });

      return tx.task.update({
        where: { id: taskId },
        data: { columnId: targetColumnId, position: newPosition },
      });
    });
  }

  private async findActiveTaskOrThrow(taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { column: { include: { board: true } } },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  private assertOwnership(
    task: { column: { board: { userId: string; deletedAt: Date | null } } },
    userId: string,
  ) {
    if (task.column.board.deletedAt) {
      throw new NotFoundException('Task not found');
    }
    if (task.column.board.userId !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }
  }

  private async assertAssigneeExists(assigneeId: string) {
    const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee) {
      throw new BadRequestException('assigneeId does not match any existing user');
    }
  }
}
