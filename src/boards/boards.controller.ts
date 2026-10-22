import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { QueryTaskDto } from '../tasks/dto/query-task.dto';

@ApiTags('Boards')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new board (auto-seeds 5 default columns)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all boards owned by the logged-in user' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.boardsService.findAllForUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single board with its columns and tasks' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: QueryTaskDto,
  ) {
    return this.boardsService.findOne(user.userId, id, query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename an owned active board' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a board' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.boardsService.softDelete(user.userId, id);
  }
}
