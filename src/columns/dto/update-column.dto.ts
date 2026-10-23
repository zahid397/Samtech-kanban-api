import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, ValidateIf, IsString, MaxLength, Min } from 'class-validator';

export class UpdateColumnDto {
  @ApiPropertyOptional({ example: 'Code Review' })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  title?: string;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  order?: number;
}
