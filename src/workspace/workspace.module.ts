import { Module } from '@nestjs/common';
import { WorkspaceController, SchedulerController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { AutomationService } from './automation.service';
import { TasksService } from '../tasks/tasks.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
@Module({
  controllers: [WorkspaceController, SchedulerController, SubscriptionController],
  providers: [WorkspaceService, AutomationService, TasksService, SubscriptionService],
})
export class WorkspaceModule {}
