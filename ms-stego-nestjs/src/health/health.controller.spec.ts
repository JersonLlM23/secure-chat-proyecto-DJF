import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('responde ok solo si SELECT 1 funciona', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

    const controller = new HealthController({ query } as unknown as DataSource);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('responde 503 si PostgreSQL no responde', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection refused'));

    const controller = new HealthController({ query } as unknown as DataSource);

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
