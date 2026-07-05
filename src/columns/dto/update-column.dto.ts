import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateColumnDto {
  @ApiPropertyOptional({ example: 'Code Review' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  title?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
