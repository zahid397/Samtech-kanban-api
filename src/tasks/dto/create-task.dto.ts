import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ValidateIf,
  IsDateString,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  IsBoolean,
  IsInt,
  Min,
  Max,
  Matches,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Priority } from '@prisma/client';

export class LabelDto {
  @IsString() @MaxLength(40) name: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) color: string;
}
export class ChecklistDto {
  @IsString() @MaxLength(200) title: string;
  @IsBoolean() done: boolean;
}
export class CreateTaskDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => LabelDto)
  labels?: LabelDto[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChecklistDto)
  checklist?: ChecklistDto[];
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(5)
  @Max(480)
  estimateMinutes?: number;

  @ApiProperty({ example: 'Design the login screen' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Task title is required' })
  @MaxLength(150)
  title: string;

  @ApiPropertyOptional({ example: 'Follow the Figma mockup shared in #design' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.MEDIUM })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(Priority, { message: 'Priority must be one of LOW, MEDIUM, HIGH' })
  priority?: Priority;

  @ApiPropertyOptional({ example: '2026-08-15' })
  @IsOptional()
  @IsDateString({ strict: true }, { message: 'dueDate must be a valid ISO date string' })
  dueDate?: string;

  @ApiPropertyOptional({ example: 'a3f1c2e4-1234-4a1b-9f3d-abcdef123456' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
