import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';

@ApiTags('Tasks')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('columns/:columnId/tasks')
  @ApiOperation({ summary: 'Create a task inside a column' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('columnId') columnId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user.userId, columnId, dto);
  }

  @Patch('tasks/:id')
  @ApiOperation({
    summary: 'Update task details (title, description, priority, dueDate, assignee)',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.userId, id, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Soft delete a task' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasksService.remove(user.userId, id);
  }

  @Patch('tasks/:id/position')
  @ApiOperation({ summary: 'Move a task within a column or to another column' })
  move(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MoveTaskDto) {
    return this.tasksService.move(user.userId, id, dto);
  }
}
