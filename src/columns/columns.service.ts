import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { audit } from '../tasks/tasks.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, boardId: string, dto: CreateColumnDto) {
    return this.prisma.write(userId, async (tx) => {
      const board = await tx.board.findUnique({ where: { id: boardId } });
      if (!board || board.deletedAt) throw new NotFoundException('Board not found');
      if (board.userId !== userId) throw new ForbiddenException('Board access denied');
      const columns = await tx.column.findMany({
        where: { boardId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
      const order = Math.min(dto.order ?? columns.length, columns.length);
      // Normalize historical duplicates and insert into one contiguous sequence.
      for (let index = 0; index < columns.length; index++) {
        await tx.column.update({
          where: { id: columns[index].id },
          data: { order: index < order ? index : index + 1 },
        });
      }
      const column = await tx.column.create({ data: { title: dto.title, order, boardId } });
      await audit(tx, userId, 'column.created', column.id, { title: column.title });
      return column;
    });
  }

  update(userId: string, columnId: string, dto: UpdateColumnDto) {
    return this.prisma.write(userId, async (tx) => {
      const column = await this.owned(tx, columnId, userId);
      if (dto.order !== undefined) {
        const columns = await tx.column.findMany({
          where: { boardId: column.boardId, NOT: { id: columnId } },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
        });
        const order = Math.min(dto.order, columns.length);
        columns.splice(order, 0, column);
        for (let index = 0; index < columns.length; index++) {
          await tx.column.update({ where: { id: columns[index].id }, data: { order: index } });
        }
      }
      const changed = await tx.column.update({
        where: { id: columnId },
        data: { ...(dto.title !== undefined && { title: dto.title }) },
      });
      await audit(tx, userId, 'column.updated', columnId);
      return changed;
    });
  }

  remove(userId: string, columnId: string) {
    return this.prisma.write(userId, async (tx) => {
      const column = await this.owned(tx, columnId, userId);
      // The same owner lock guards task creation, moves and deletion. A new task
      // cannot arrive between this check and the database cascade.
      if (await tx.task.count({ where: { columnId } }))
        throw new BadRequestException(
          'Move active tasks and restore archived task history before deleting this column',
        );
      await tx.column.delete({ where: { id: columnId } });
      const remaining = await tx.column.findMany({
        where: { boardId: column.boardId },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
      for (let index = 0; index < remaining.length; index++) {
        await tx.column.update({ where: { id: remaining[index].id }, data: { order: index } });
      }
      await audit(tx, userId, 'column.deleted', columnId);
      return { message: 'Column deleted successfully' };
    });
  }

  private async owned(tx: Prisma.TransactionClient, columnId: string, userId: string) {
    const column = await tx.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });
    if (!column || column.board.deletedAt) throw new NotFoundException('Column not found');
    if (column.board.userId !== userId) throw new ForbiddenException('Column access denied');
    return column;
  }
}
