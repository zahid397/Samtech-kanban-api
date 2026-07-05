import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@ApiTags('Columns')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class ColumnsController {
  constructor(private readonly columnsService: ColumnsService) {}

  @Post('boards/:boardId/columns')
  @ApiOperation({ summary: 'Create a column inside a board' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columnsService.create(user.userId, boardId, dto);
  }

  @Patch('columns/:id')
  @ApiOperation({ summary: 'Update a column title or order' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columnsService.update(user.userId, id, dto);
  }

  @Delete('columns/:id')
  @ApiOperation({ summary: 'Delete a column (and its tasks)' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.columnsService.remove(user.userId, id);
  }
}
