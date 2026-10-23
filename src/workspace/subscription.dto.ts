import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn } from 'class-validator';
import { FuturePlan } from './subscription.service';

export class UpgradeInterestDto {
  @ApiProperty({ enum: ['PRO', 'ENTERPRISE'] })
  @IsIn(['PRO', 'ENTERPRISE'])
  plan: FuturePlan;

  @ApiProperty({
    enum: [true],
    description: 'Confirm recording interest only; does not activate a paid subscription.',
  })
  @Equals(true)
  approved: boolean;
}
