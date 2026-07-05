import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/**
 * Deliberately does NOT include columnId or position. Moving a task between
 * columns or reordering it is handled exclusively by PATCH /tasks/:id/position
 * (see MoveTaskDto) so that position bookkeeping always goes through the one
 * transactional code path. See README > Key Technical Decisions.
 */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
