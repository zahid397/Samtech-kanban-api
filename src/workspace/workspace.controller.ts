import { Body, Controller, Get, Headers, Param, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/jwt-payload.interface';
import { WorkspaceService } from './workspace.service';
import { AutomationService } from './automation.service';
import { AgentDto, ApproveDto, AutomationDto, CommandDto, FileDto, ImportDto, IntelligenceDto, SpeakDto, ToggleDto, VoiceDto } from './workspace.dto';
@ApiTags('Workspace') @ApiBearerAuth('access-token') @UseGuards(JwtAuthGuard) @Controller()
export class WorkspaceController {
 constructor(private readonly work:WorkspaceService,private readonly auto:AutomationService){}
 @Get('workspace') dashboard(@CurrentUser() u:AuthenticatedUser){return this.work.dashboard(u.userId);}
 @Get('workspace/health') health(){return this.work.health();}
 @Post('ai/interpret') @Throttle({default:{limit:15,ttl:60000}}) interpret(@CurrentUser() u:AuthenticatedUser,@Body() d:IntelligenceDto){return this.work.propose(u.userId,d);}
 @Post('ai/proposals/:id/approve') approve(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Body() d:ApproveDto){return this.work.approve(u.userId,id,d);}
 @Post('voice/transcribe') @Throttle({default:{limit:6,ttl:60000}}) transcribe(@Body() d:VoiceDto){return this.work.gateway('/voice/transcribe',d);}
 @Post('voice/speak') @Throttle({default:{limit:10,ttl:60000}}) speak(@Body() d:SpeakDto){return this.work.gateway('/voice/speak',d);}
 @Get('agents') agents(@CurrentUser() u:AuthenticatedUser){return this.work.agents(u.userId);}
 @Post('agents') @Throttle({default:{limit:10,ttl:60000}}) run(@CurrentUser() u:AuthenticatedUser,@Body() d:AgentDto){return this.work.runAgent(u.userId,d);}
 @Post('agents/:id/cancel') cancel(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string){return this.work.cancelAgent(u.userId,id);}
 @Post('commands') command(@CurrentUser() u:AuthenticatedUser,@Body() d:CommandDto){return this.work.command(u.userId,d.command);}
 @Get('automations') automations(@CurrentUser() u:AuthenticatedUser){return this.auto.list(u.userId);}
 @Post('automations') automation(@CurrentUser() u:AuthenticatedUser,@Body() d:AutomationDto){return this.auto.create(u.userId,d);}
 @Patch('automations/:id') toggle(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string,@Body() d:ToggleDto){return this.auto.toggle(u.userId,id,d.enabled);}
 @Post('automations/tick') tick(@CurrentUser() u:AuthenticatedUser){return this.auto.tick(u.userId);}
 @Get('files') files(@CurrentUser() u:AuthenticatedUser){return this.work.files(u.userId);}
 @Get('files/:id') file(@CurrentUser() u:AuthenticatedUser,@Param('id') id:string){return this.work.file(u.userId,id);}
 @Post('files') saveFile(@CurrentUser() u:AuthenticatedUser,@Body() d:FileDto){return this.work.saveFile(u.userId,d);}
 @Post('tasks/import') import(@CurrentUser() u:AuthenticatedUser,@Body() d:ImportDto){return this.work.importTasks(u.userId,d);}
}
@Controller('internal')
export class SchedulerController {
 constructor(private readonly auto:AutomationService){}
 @Post('automations/tick') tick(@Headers('authorization') auth=''){
  const secret=process.env.SCHEDULER_SECRET||'';const expected=Buffer.from(`Bearer ${secret}`);const got=Buffer.from(auth);
  if(secret.length<32||got.length!==expected.length||!timingSafeEqual(got,expected))throw new UnauthorizedException();return this.auto.tick();
 }
}
