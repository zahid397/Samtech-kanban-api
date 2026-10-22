import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { UpgradeInterestDto } from './subscription.dto';
import { SubscriptionService } from './subscription.service';

@ApiTags('Subscription preview')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('workspace/subscription')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get()
  @ApiOperation({
    summary: 'Read the current preview plan, available features and owner-scoped usage',
  })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.summary(user.userId);
  }

  @Post('upgrade-interest')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Record interest in a future plan without activating a subscription or charging',
  })
  recordInterest(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpgradeInterestDto) {
    return this.subscriptions.recordInterest(user.userId, dto.plan, dto.approved);
  }
}
