import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'SammTech Kanban Task Management API',
      timestamp: new Date().toISOString(),
    };
  }
}
