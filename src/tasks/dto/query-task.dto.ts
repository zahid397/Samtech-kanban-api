import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { Priority } from '@prisma/client';

export class QueryTaskDto {
  @ApiPropertyOptional({
    example: 'login',
    description: 'Search tasks by title (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: Priority, example: Priority.HIGH })
  @IsOptional()
  @IsEnum(Priority, { message: 'Priority must be one of LOW, MEDIUM, HIGH' })
  priority?: Priority;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Filter tasks due on this date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'dueDate must be a valid ISO date string (YYYY-MM-DD)' })
  dueDate?: string;
}
