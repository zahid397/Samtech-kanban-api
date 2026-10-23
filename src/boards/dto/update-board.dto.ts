import { CreateBoardDto } from './create-board.dto';

/** Renaming changes only the validated title, never ownership or deletion state. */
export class UpdateBoardDto extends CreateBoardDto {}
