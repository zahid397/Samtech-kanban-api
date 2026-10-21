import { audit, taskDetails } from '../tasks/tasks.service';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { QueryTaskDto } from '../tasks/dto/query-task.dto';

// Every new board is seeded with these columns, matching the default Kanban
// layout described in the assignment. See README > Key Technical Decisions.
const DEFAULT_COLUMNS = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateBoardDto) {
    return this.prisma.write(userId, async (tx) => {
      const board = await tx.board.create({
        data: {
          title: dto.title,
          userId,
          columns: {
            create: DEFAULT_COLUMNS.map((title, index) => ({
              title,
              order: index,
              isDone: title === 'Done',
            })),
          },
        },
        include: {
          columns: { orderBy: { order: 'asc' } },
        },
      });
      await audit(tx, userId, 'board.created', board.id, { title: board.title });
      return board;
    });
  }

  findAllForUser(userId: string) {
    return this.prisma.board.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, boardId: string, query: QueryTaskDto) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });

    if (!board || board.deletedAt) {
      throw new NotFoundException('Board not found');
    }
    if (board.userId !== userId) {
      throw new ForbiddenException('You do not have access to this board');
    }

    const taskWhere: Prisma.TaskWhereInput = { deletedAt: null };

    if (query.search) {
      taskWhere.title = { contains: query.search, mode: 'insensitive' };
    }
    if (query.priority) {
      taskWhere.priority = query.priority;
    }
    if (query.dueDate) {
      const start = new Date(query.dueDate);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      taskWhere.dueDate = { gte: start, lt: end };
    }

    return this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              where: taskWhere,
              orderBy: { position: 'asc' },
              include: taskDetails,
            },
          },
        },
      },
    });
  }

  async softDelete(userId: string, boardId: string) {
    return this.prisma.write(userId, async (tx) => {
      const board = await tx.board.findUnique({ where: { id: boardId } });

      if (!board || board.deletedAt) {
        throw new NotFoundException('Board not found');
      }
      if (board.userId !== userId) {
        throw new ForbiddenException('You do not have access to this board');
      }

      await tx.board.update({
        where: { id: boardId },
        data: { deletedAt: new Date() },
      });

      await audit(tx, userId, 'board.deleted', boardId);
      return { message: 'Board deleted successfully' };
    });
  }
}
