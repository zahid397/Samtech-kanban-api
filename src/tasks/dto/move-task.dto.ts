import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({
    example: 'b2f1c2e4-5678-4a1b-9f3d-abcdef654321',
    description:
      "Column to move the task into. Pass the task's current column id for a same-column reorder.",
  })
  @IsString()
  @IsNotEmpty({ message: 'targetColumnId is required' })
  targetColumnId: string;

  @ApiProperty({ example: 1, description: 'Zero-based position within the target column' })
  @IsInt()
  @Min(0)
  newPosition: number;
}
