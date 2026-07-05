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
    return this.prisma.board.create({
      data: {
        title: dto.title,
        userId,
        columns: {
          create: DEFAULT_COLUMNS.map((title, index) => ({ title, order: index })),
        },
      },
      include: {
        columns: { orderBy: { order: 'asc' } },
      },
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
      end.setDate(end.getDate() + 1);
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
            },
          },
        },
      },
    });
  }

  async softDelete(userId: string, boardId: string) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });

    if (!board || board.deletedAt) {
      throw new NotFoundException('Board not found');
    }
    if (board.userId !== userId) {
      throw new ForbiddenException('You do not have access to this board');
    }

    await this.prisma.board.update({
      where: { id: boardId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Board deleted successfully' };
  }
}
