import { PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import {
  createHostPng,
  createLsbEmbeddedPng,
} from '../../../test/fixtures/synthetic-images.js';
import {
  ImageDecodingError,
  SteganographyService,
} from './steganography.service.js';

function createService(
  overrides: Record<string, number> = {},
): SteganographyService {
  const values: Record<string, number> = {
    MAX_IMAGE_WIDTH: 1000,
    MAX_IMAGE_HEIGHT: 1000,
    MAX_IMAGE_PIXELS: 1_000_000,
    STEGO_SUSPICIOUS_THRESHOLD: 0.75,
    STEGO_CLEAR_THRESHOLD: 0.55,
    ...overrides,
  };

  return new SteganographyService({
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService);
}

describe('SteganographyService (métricas LSB reales)', () => {
  it('produce métricas reproducibles para la misma imagen', async () => {
    const service = createService();
    const image = await createHostPng(32, 32);

    const first = await service.analyze(image);
    const second = await service.analyze(image);

    expect(second).toEqual(first);
  });

  it('distingue un host controlado de una imagen con LSB inyectados', async () => {
    const service = createService();

    const host = await service.analyze(await createHostPng(48, 48));
    const embedded = await service.analyze(await createLsbEmbeddedPng(48, 48));

    /*
     * Estas comparaciones son relativas a dos imágenes sintéticas
     * controladas. No constituyen una afirmación de precisión forense
     * general; los umbrales requieren calibración.
     */
    expect(host.lsbEntropy).toBeLessThan(0.01);
    expect(embedded.lsbEntropy).toBeGreaterThan(host.lsbEntropy);

    expect(host.poVScore).toBeLessThan(0.01);
    expect(embedded.poVScore).toBeGreaterThan(host.poVScore);

    expect(embedded.anomalyScore).toBeGreaterThan(host.anomalyScore);
    expect(embedded.anomalyScore).toBeGreaterThan(
      embedded.threshold,
    );
  });

  it('calcula métricas agregadas y por canal RGB, excluyendo alfa', async () => {
    const metrics = await createService().analyze(
      await createLsbEmbeddedPng(16, 16),
    );

    expect(metrics.width).toBe(16);
    expect(metrics.height).toBe(16);
    expect(metrics.analyzedPixels).toBe(256);
    expect(metrics.analyzedBytes).toBe(256 * 3);
    expect(metrics.analyzedBits).toBe(256 * 3);
    expect(metrics.perChannel.red.lsbEntropy).toBeGreaterThan(0);
    expect(metrics.perChannel.green.lsbEntropy).toBeGreaterThan(0);
    expect(metrics.perChannel.blue.lsbEntropy).toBeGreaterThan(0);
    expect(metrics.chiSquareDegreesOfFreedom).toBeGreaterThanOrEqual(0);
    expect(metrics.chiSquarePValue).toBeGreaterThanOrEqual(0);
    expect(metrics.chiSquarePValue).toBeLessThanOrEqual(1);
  });

  it('rechaza imágenes que exceden el total de píxeles permitido', async () => {
    const service = createService({ MAX_IMAGE_PIXELS: 100 });

    await expect(service.analyze(await createHostPng(32, 32))).rejects.toThrow(
      PayloadTooLargeException,
    );
  });

  it('rechaza imágenes malformadas como error de decodificación', async () => {
    const malformed = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0xaa),
    ]);

    await expect(createService().analyze(malformed)).rejects.toThrow(
      ImageDecodingError,
    );
  });
});
