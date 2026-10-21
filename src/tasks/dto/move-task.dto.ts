import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min, Max } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({
    example: 'b2f1c2e4-5678-4a1b-9f3d-abcdef654321',
    description:
      "Column to move the task into. Pass the task's current column id for a same-column reorder.",
  })
  @IsUUID()
  targetColumnId: string;

  @ApiProperty({ example: 1, description: 'Zero-based position within the target column' })
  @IsInt()
  @Min(0)
  @Max(1000000)
  newPosition: number;
}
