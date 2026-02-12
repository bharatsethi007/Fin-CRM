import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    const db = await this.healthService.checkDatabase();
    const ok = db.ok;
    return {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: db,
    };
  }
}
