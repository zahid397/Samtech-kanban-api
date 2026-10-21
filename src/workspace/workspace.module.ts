import { Module } from '@nestjs/common';
import { WorkspaceController, SchedulerController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { AutomationService } from './automation.service';
import { TasksService } from '../tasks/tasks.service';
@Module({controllers:[WorkspaceController,SchedulerController],providers:[WorkspaceService,AutomationService,TasksService]})
export class WorkspaceModule {}
