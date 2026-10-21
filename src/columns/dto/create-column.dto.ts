import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, ValidateIf, IsString, MaxLength, Min } from 'class-validator';

export class CreateColumnDto {
  @ApiProperty({ example: 'In Progress' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Column title is required' })
  @MaxLength(60)
  title: string;

  @ApiPropertyOptional({
    example: 2,
    description:
      "Zero-based position among the board's columns. Defaults to the end of the list if omitted.",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  order?: number;
}
