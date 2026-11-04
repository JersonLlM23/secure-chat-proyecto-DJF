import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public/public.decorator.js';

@ApiTags('health')
@Controller()
export class AppController {
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Estado del microservicio AUTH' })
  health() {
    return {
      status: 'ok',
      service: 'ms-auth-nestjs',
      timestamp: new Date().toISOString(),
    };
  }
}
