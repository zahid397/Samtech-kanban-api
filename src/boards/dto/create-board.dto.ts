import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: 'Product Launch Roadmap' })
  @IsString()
  @IsNotEmpty({ message: 'Board title is required' })
  @MaxLength(120)
  title: string;
}
