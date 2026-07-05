import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Priority } from '@prisma/client';

export class CreateTaskDto {
  @ApiProperty({ example: 'Design the login screen' })
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ example: 'Follow the Figma mockup shared in #design' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
  @IsOptional()
  @IsEnum(Priority, { message: 'Priority must be one of LOW, MEDIUM, HIGH' })
  priority?: Priority;

  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsDateString({}, { message: 'dueDate must be a valid ISO date string' })
  dueDate?: string;

  @ApiPropertyOptional({ example: 'a3f1c2e4-1234-4a1b-9f3d-abcdef123456' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
