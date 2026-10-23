import {
  ArrayMinSize,
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTaskDto } from '../tasks/dto/create-task.dto';
export class IntelligenceDto {
  @IsString() @MaxLength(4000) text: string;
  @IsOptional() @IsUUID() boardId?: string;
  @IsOptional()
  @IsIn([
    'interpret',
    'plan',
    'summary',
    'search',
    'analyze',
    'qa',
    'documentation',
    'research',
    'automation',
  ])
  kind?: string;
  @IsOptional() @IsInt() @Min(30) @Max(720) capacityMinutes?: number;
}
export class ApproveDto {
  @Equals(true) approved: boolean;
  @IsUUID() columnId: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  drafts?: CreateTaskDto[];
}
export class AgentDto extends IntelligenceDto {
  @IsIn(['planner', 'task-manager', 'research', 'documentation', 'analyst', 'qa', 'automation'])
  agent: string;
}
export class CommandDto {
  @IsIn([
    'help',
    'boards list',
    'tasks today',
    'tasks overdue',
    'project summarize',
    'agent status',
    'automation list',
    'health',
  ])
  command: string;
}
export class AutomationDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsIn([
    'daily-briefing',
    'weekly-summary',
    'due-reminder',
    'overdue-alert',
    'recurring-task',
    'dependency-notification',
    'next-actions',
    'progress-report',
  ])
  kind: string;
  @IsInt() @Min(1) @Max(8760) frequencyHours: number;
  @IsOptional() @IsUUID() boardId?: string;
  @IsOptional() @IsUUID() columnId?: string;
  @IsOptional() @ValidateNested() @Type(() => CreateTaskDto) task?: CreateTaskDto;
  @IsOptional() @IsIn(['always', 'has-overdue', 'has-open']) condition?: string;
  @Equals(true) approved: boolean;
}
export class ToggleDto {
  @IsBoolean() enabled: boolean;
}
export class FileDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsString() @MaxLength(100000) content: string;
}
export class ImportDto {
  @IsUUID() columnId: string;
  @Equals(true) approved: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskDto)
  tasks: CreateTaskDto[];
}
export class VoiceDto {
  @IsString() @MinLength(1) @MaxLength(6000000) audio: string;
}
export class SpeakDto {
  @IsString() @MinLength(1) @MaxLength(1000) text: string;
}
