import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}
  getHealth() { return {status:'ok',service:'SammTech AI OS',timestamp:new Date().toISOString()}; }
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; return {...this.getHealth(),database:'ok'}; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
  }
}
