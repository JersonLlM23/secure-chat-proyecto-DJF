import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Healthcheck real de STEGO y PostgreSQL',
  })
  @ApiResponse({
    status: 200,
    description: 'Base de datos conectada',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        database: { type: 'string', example: 'connected' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Base de datos no disponible',
  })
  async check(): Promise<{ status: 'ok'; database: 'connected' }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unavailable',
      });
    }

    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
