import { PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import {
  create16BitBmp,
  createBmpFromRgb,
  createDeterministicPayload,
  createHostBmp,
  createHostPng,
  createHostRaw,
  createIndexedBmp,
  createLsbEmbeddedPng,
  createOs2CoreBmp,
  createRle8Bmp,
  embedLsbPayload,
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

  it('procesa un BMP 24 bits con las mismas métricas que su PNG equivalente', async () => {
    const service = createService();
    const raw = createHostRaw(32, 32);

    const pngMetrics = await service.analyze(await createHostPng(32, 32));
    const bmpMetrics = await service.analyze(
      createBmpFromRgb(raw, 32, 32),
    );

    expect(bmpMetrics.width).toBe(32);
    expect(bmpMetrics.height).toBe(32);
    expect(bmpMetrics.analyzedBytes).toBe(32 * 32 * 3);
    expect(bmpMetrics.lsbEntropy).toBeCloseTo(pngMetrics.lsbEntropy, 10);
    expect(bmpMetrics.poVScore).toBeCloseTo(pngMetrics.poVScore, 10);
    expect(bmpMetrics.anomalyScore).toBeCloseTo(
      pngMetrics.anomalyScore,
      10,
    );
  });

  it('detecta LSB inyectados en un BMP igual que en el PNG equivalente', async () => {
    const service = createService();
    const raw = createHostRaw(48, 48);
    const payload = createDeterministicPayload(Math.ceil(raw.length / 8));
    const embeddedRaw = embedLsbPayload(raw, payload);

    const host = await service.analyze(await createHostBmp(48, 48));
    const embedded = await service.analyze(
      createBmpFromRgb(embeddedRaw, 48, 48),
    );

    expect(embedded.lsbEntropy).toBeGreaterThan(host.lsbEntropy);
    expect(embedded.anomalyScore).toBeGreaterThan(host.anomalyScore);
  });

  it.each([
    [
      '24 bits top-down',
      () => createBmpFromRgb(createHostRaw(16, 16), 16, 16, { topDown: true }),
    ],
    [
      '32 bits',
      () => createBmpFromRgb(createHostRaw(16, 16), 16, 16, { bitPP: 32 }),
    ],
    ['8 bits con paleta', () => createIndexedBmp(16, 16)],
    ['16 bits', () => create16BitBmp(16, 16)],
  ])('decodifica BMP %s', async (_name, build) => {
    const metrics = await createService().analyze(build());

    expect(metrics.width).toBe(16);
    expect(metrics.height).toBe(16);
    expect(metrics.analyzedBytes).toBe(16 * 16 * 3);
  });

  it('rechaza BMP que exceden el total de píxeles desde la cabecera', async () => {
    const service = createService({ MAX_IMAGE_PIXELS: 100 });

    await expect(
      service.analyze(await createHostBmp(32, 32)),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it.each([
    ['OS/2 BITMAPCOREHEADER', createOs2CoreBmp],
    ['RLE8', createRle8Bmp],
  ])(
    'clasifica la variante BMP %s como no soportada',
    async (_name, build) => {
      const error = await createService()
        .analyze(build())
        .then(
          () => null,
          (reason: unknown) => reason,
        );

      expect(error).toBeInstanceOf(ImageDecodingError);
      expect((error as ImageDecodingError).reason).toBe(
        'unsupported_image_variant',
      );
      expect((error as ImageDecodingError).format).toBe('bmp');
    },
  );

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
