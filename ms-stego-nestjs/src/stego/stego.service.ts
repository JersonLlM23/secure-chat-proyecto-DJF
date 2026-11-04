import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import { AUTH_ACTIONS } from '../auth/auth-actions.js';
import { AuthClientService } from '../auth/auth-client.service.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AnalysisResponseDto } from './dto/analysis-response.dto.js';
import { StegoAction } from './enums/stego-action.enum.js';
import { StegoStatus } from './enums/stego-status.enum.js';
import { FileValidationService } from './services/file-validation.service.js';
import { StegoAnalysisService } from './services/stego-analysis.service.js';
import {
  ANALYSIS_LIMITATIONS,
  ANALYSIS_METHOD,
  ImageDecodingError,
  SteganographyService,
} from './services/steganography.service.js';

@Injectable()
export class StegoService {
  constructor(
    private readonly fileValidation: FileValidationService,
    private readonly steganography: SteganographyService,
    private readonly analyses: StegoAnalysisService,
    private readonly authClient: AuthClientService,
  ) {}

  async analyze(
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined,
  ): Promise<AnalysisResponseDto> {
    /*
     * Fail-Closed: ninguna validación ni decodificación ocurre antes de
     * una autorización explícita de AUTH.
     */
    await this.authClient.assertAuthorized({
      token: user.token,
      userId: user.userId,
      action: AUTH_ACTIONS.ANALYZE,
    });

    const validated = this.fileValidation.validate(file);

    /*
     * El hash se calcula sobre los bytes originales recibidos, antes de
     * cualquier decodificación o transformación con Sharp.
     */
    const sha256 = createHash('sha256')
      .update(file!.buffer)
      .digest('hex');

    let metrics;

    try {
      metrics = await this.steganography.analyze(file!.buffer);
    } catch (error) {
      if (error instanceof ImageDecodingError) {
        /*
         * El archivo superó la validación y el análisis ya se había
         * iniciado. Se conserva evidencia mínima como estado `error`,
         * sin presentarlo como análisis exitoso.
         */
        const record = await this.analyses.create({
          id: randomUUID(),
          userId: user.userId,
          filename: validated.filename,
          sha256,
          technique: ANALYSIS_METHOD,
          status: StegoStatus.ERROR,
          action: StegoAction.RECHAZO,
          indicators: {
            stage: 'decoding',
            reason: 'image_decoding_error',
          },
          limitations: ANALYSIS_LIMITATIONS,
        });

        throw new UnprocessableEntityException({
          message: 'No se pudo decodificar la imagen',
          analysisId: record.id,
        });
      }

      throw error;
    }

    const status = this.classify(metrics.anomalyScore);

    const record = await this.analyses.create({
      id: randomUUID(),
      userId: user.userId,
      filename: validated.filename,
      sha256,
      technique: ANALYSIS_METHOD,
      status,
      action: this.actionFor(status),
      indicators: {
        ...metrics,
        method: ANALYSIS_METHOD,
        metricModel: 'aggregate_rgb_with_per_channel',
        metricVersion: '1.0.0',
      },
      limitations: ANALYSIS_LIMITATIONS,
    });

    return AnalysisResponseDto.fromEntity(record);
  }

  async getResult(
    user: AuthenticatedUser,
    id: string,
  ): Promise<AnalysisResponseDto> {
    const record = await this.analyses.findById(id);

    if (!record) {
      throw new NotFoundException('Resultado no encontrado');
    }

    /*
     * La posesión local del registro no sustituye la comprobación de
     * sesión vigente en AUTH. Para resultados ajenos se exige la acción
     * read.any; para los propios, read.own.
     */
    const action =
      record.userId === user.userId
        ? AUTH_ACTIONS.READ_OWN
        : AUTH_ACTIONS.READ_ANY;

    try {
      await this.authClient.assertAuthorized({
        token: user.token,
        userId: user.userId,
        action,
        resourceId: record.id,
      });
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw new ForbiddenException('No autorizado para leer este resultado');
      }

      throw error;
    }

    return AnalysisResponseDto.fromEntity(record);
  }

  private classify(anomalyScore: number): StegoStatus {
    const thresholds = this.steganography.getThresholds();

    if (anomalyScore >= thresholds.suspicious) {
      return StegoStatus.SOSPECHOSO;
    }

    if (anomalyScore <= thresholds.clear) {
      return StegoStatus.SIN_INDICIOS;
    }

    return StegoStatus.NO_CONCLUYENTE;
  }

  private actionFor(status: StegoStatus): StegoAction {
    switch (status) {
      case StegoStatus.SIN_INDICIOS:
        return StegoAction.ACEPTADO;
      case StegoStatus.SOSPECHOSO:
        return StegoAction.CUARENTENA;
      case StegoStatus.NO_CONCLUYENTE:
        return StegoAction.ADVERTENCIA;
      case StegoStatus.ERROR:
        return StegoAction.RECHAZO;
    }
  }
}
