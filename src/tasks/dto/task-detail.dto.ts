import { IsString, MaxLength, IsNotEmpty, IsUUID } from 'class-validator';
export class CommentDto { @IsString() @IsNotEmpty() @MaxLength(4000) body: string; }
export class DependencyDto { @IsUUID() dependsOnId: string; }
