import { Controller, Get } from '@nestjs/common';
import { Transport, RedisOptions } from '@nestjs/microservices';
import { HealthCheck, HealthCheckService, MicroserviceHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private microservice: MicroserviceHealthIndicator
    ) {}
 
    @Get()
    @HealthCheck()
    check() {
      return this.health.check([
        async () =>
          this.microservice.pingCheck('tcp', {
            transport: Transport.TCP,
            options: { host: 'localhost', port: 8889 },
          }),
        async () =>
          this.microservice.pingCheck<RedisOptions>('redis', {
            transport: Transport.REDIS,
            options: {
              url: 'redis://localhost:6379',
            },
          }),
      ]);
    }
    
}
