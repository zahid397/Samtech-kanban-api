import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, boardId: string, dto: CreateColumnDto) {
    const board = await this.prisma.board.findUnique({ where: { id: boardId } });

    if (!board || board.deletedAt) {
      throw new NotFoundException('Board not found');
    }
    if (board.userId !== userId) {
      throw new ForbiddenException('You do not have access to this board');
    }

    let order = dto.order;
    if (order === undefined) {
      const lastColumn = await this.prisma.column.findFirst({
        where: { boardId },
        orderBy: { order: 'desc' },
      });
      order = lastColumn ? lastColumn.order + 1 : 0;
    }

    return this.prisma.column.create({
      data: { title: dto.title, order, boardId },
    });
  }

  async update(userId: string, columnId: string, dto: UpdateColumnDto) {
    const column = await this.findColumnOrThrow(columnId);
    this.assertOwnership(column, userId);

    return this.prisma.column.update({
      where: { id: columnId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });
  }

  async remove(userId: string, columnId: string) {
    const column = await this.findColumnOrThrow(columnId);
    this.assertOwnership(column, userId);

    // Deleting a column is a hard delete and cascades (via the Prisma schema's
    // onDelete: Cascade) to permanently remove its tasks too. See README >
    // Key Technical Decisions for why this was chosen over soft-deleting the
    // column's tasks individually.
    await this.prisma.column.delete({ where: { id: columnId } });

    return { message: 'Column deleted successfully' };
  }

  private async findColumnOrThrow(columnId: string) {
    const column = await this.prisma.column.findUnique({
      where: { id: columnId },
      include: { board: true },
    });

    if (!column) {
      throw new NotFoundException('Column not found');
    }

    return column;
  }

  private assertOwnership(
    column: { board: { userId: string; deletedAt: Date | null } },
    userId: string,
  ) {
    if (column.board.deletedAt) {
      throw new NotFoundException('Column not found');
    }
    if (column.board.userId !== userId) {
      throw new ForbiddenException('You do not have access to this column');
    }
  }
}
