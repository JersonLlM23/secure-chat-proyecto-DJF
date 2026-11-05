import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { AuthClientService } from '../auth/auth-client.service.js';
import { AUTH_ACTIONS } from '../auth/auth-actions.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import type { StegoAnalysis } from './entities/stego-analysis.entity.js';
import { StegoAction } from './enums/stego-action.enum.js';
import { StegoStatus } from './enums/stego-status.enum.js';
import type { FileValidationService } from './services/file-validation.service.js';
import type { StegoAnalysisService } from './services/stego-analysis.service.js';
import {
  ImageDecodingError,
  type SteganographyService,
} from './services/steganography.service.js';
import { StegoService } from './stego.service.js';

const userId = '55555555-5555-4555-8555-555555555555';

const user: AuthenticatedUser = {
  userId,
  token: 'jwt-token',
  payload: {
    sub: userId,
    typ: 'access',
  },
};

const file = {
  fieldname: 'file',
  originalname: 'imagen.png',
  encoding: '7bit',
  mimetype: 'image/png',
  size: 3,
  buffer: Buffer.from('abc'),
} as unknown as Express.Multer.File;

function createContext(anomalyScore = 0.1) {
  const authClient = {
    assertAuthorized: vi.fn().mockResolvedValue(undefined),
  };

  const fileValidation = {
    validate: vi.fn().mockReturnValue({
      format: 'png',
      extension: '.png',
      filename: 'imagen.png',
    }),
  };

  const steganography = {
    analyze: vi.fn().mockResolvedValue({ anomalyScore }),
    getThresholds: () => ({ suspicious: 0.75, clear: 0.55 }),
  };

  const analyses = {
    create: vi.fn((data: Partial<StegoAnalysis>) =>
      Promise.resolve({
        ...data,
        id: '66666666-6666-4666-8666-666666666666',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ),
    findById: vi.fn(),
  };

  const service = new StegoService(
    fileValidation as unknown as FileValidationService,
    steganography as unknown as SteganographyService,
    analyses as unknown as StegoAnalysisService,
    authClient as unknown as AuthClientService,
  );

  return { service, authClient, fileValidation, steganography, analyses };
}

describe('StegoService', () => {
  it('autoriza con AUTH antes de validar y guarda el análisis', async () => {
    const { service, authClient, fileValidation, analyses } =
      createContext(0.1);

    const result = await service.analyze(user, file);

    expect(authClient.assertAuthorized).toHaveBeenCalledWith({
      token: 'jwt-token',
      userId,
      action: AUTH_ACTIONS.ANALYZE,
    });
    expect(fileValidation.validate).toHaveBeenCalledWith(file);
    expect(analyses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: StegoStatus.SIN_INDICIOS,
        action: StegoAction.ACEPTADO,
        sha256: createHash('sha256').update('abc').digest('hex'),
      }),
    );
    expect(result.status).toBe(StegoStatus.SIN_INDICIOS);
  });

  it('clasifica anomalías por encima del umbral como sospechoso/cuarentena', async () => {
    const { service } = createContext(0.9);

    const result = await service.analyze(user, file);

    expect(result.status).toBe(StegoStatus.SOSPECHOSO);
    expect(result.action).toBe(StegoAction.CUARENTENA);
  });

  it('clasifica valores intermedios como no_concluyente/advertencia', async () => {
    const { service } = createContext(0.65);

    const result = await service.analyze(user, file);

    expect(result.status).toBe(StegoStatus.NO_CONCLUYENTE);
    expect(result.action).toBe(StegoAction.ADVERTENCIA);
  });

  it('no procesa ni persiste si AUTH deniega (Fail-Closed)', async () => {
    const { service, authClient, fileValidation, analyses } =
      createContext();

    authClient.assertAuthorized.mockRejectedValue(
      new ForbiddenException('insufficient_permissions'),
    );

    await expect(service.analyze(user, file)).rejects.toThrow(
      ForbiddenException,
    );

    expect(fileValidation.validate).not.toHaveBeenCalled();
    expect(analyses.create).not.toHaveBeenCalled();
  });

  it('persiste estado error si falla la decodificación tras iniciar el análisis', async () => {
    const { service, steganography, analyses } = createContext();

    steganography.analyze.mockRejectedValue(new ImageDecodingError());

    await expect(service.analyze(user, file)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(analyses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: StegoStatus.ERROR,
        action: StegoAction.RECHAZO,
        indicators: {
          stage: 'decoding',
          reason: 'image_decoding_error',
        },
      }),
    );
  });

  it('distingue una variante no soportada de un error genérico de decodificación', async () => {
    const { service, steganography, analyses } = createContext();

    steganography.analyze.mockRejectedValue(
      new ImageDecodingError('unsupported_image_variant', {
        format: 'bmp',
        detail: 'compresión BMP 1',
      }),
    );

    await expect(service.analyze(user, file)).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(analyses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: StegoStatus.ERROR,
        action: StegoAction.RECHAZO,
        indicators: {
          stage: 'decoding',
          reason: 'unsupported_image_variant',
          format: 'bmp',
        },
      }),
    );
  });

  it('consulta read.own para el propietario del resultado', async () => {
    const { service, authClient, analyses } = createContext();

    analyses.findById.mockResolvedValue({
      id: 'result-1',
      userId,
    } as StegoAnalysis);

    await service.getResult(user, 'result-1');

    expect(authClient.assertAuthorized).toHaveBeenCalledWith({
      token: 'jwt-token',
      userId,
      action: AUTH_ACTIONS.READ_OWN,
      resourceId: 'result-1',
    });
  });

  it('consulta read.any para resultados de otro usuario', async () => {
    const { service, authClient, analyses } = createContext();

    analyses.findById.mockResolvedValue({
      id: 'result-2',
      userId: '77777777-7777-4777-8777-777777777777',
    } as StegoAnalysis);

    await service.getResult(user, 'result-2');

    expect(authClient.assertAuthorized).toHaveBeenCalledWith({
      token: 'jwt-token',
      userId,
      action: AUTH_ACTIONS.READ_ANY,
      resourceId: 'result-2',
    });
  });

  it('devuelve 404 sin consultar AUTH si el resultado no existe', async () => {
    const { service, authClient, analyses } = createContext();

    analyses.findById.mockResolvedValue(null);

    await expect(service.getResult(user, 'missing')).rejects.toThrow(
      NotFoundException,
    );

    expect(authClient.assertAuthorized).not.toHaveBeenCalled();
  });

  it('oculta la decisión de AUTH al denegar lectura', async () => {
    const { service, authClient, analyses } = createContext();

    analyses.findById.mockResolvedValue({
      id: 'result-3',
      userId: '77777777-7777-4777-8777-777777777777',
    } as StegoAnalysis);

    authClient.assertAuthorized.mockRejectedValue(
      new ForbiddenException('insufficient_permissions'),
    );

    await expect(service.getResult(user, 'result-3')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
