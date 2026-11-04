import { ApiProperty } from '@nestjs/swagger';

import type { StegoAnalysis } from '../entities/stego-analysis.entity.js';
import { StegoAction } from '../enums/stego-action.enum.js';
import { StegoStatus } from '../enums/stego-status.enum.js';

export class AnalysisResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty({ description: 'SHA-256 de los bytes originales recibidos' })
  sha256!: string;

  @ApiProperty({ example: 'lsb_statistical_analysis' })
  technique!: string;

  @ApiProperty({ enum: StegoStatus })
  status!: StegoStatus;

  @ApiProperty({
    description:
      'Métricas reales del análisis LSB. En estado error contiene el motivo.',
    type: 'object',
    additionalProperties: true,
  })
  indicators!: Record<string, unknown>;

  @ApiProperty({ enum: StegoAction })
  action!: StegoAction;

  @ApiProperty()
  limitations!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  static fromEntity(entity: StegoAnalysis): AnalysisResponseDto {
    return {
      id: entity.id,
      userId: entity.userId,
      filename: entity.filename,
      sha256: entity.sha256,
      technique: entity.technique,
      status: entity.status,
      indicators: entity.indicators,
      action: entity.action,
      limitations: entity.limitations,
      createdAt: entity.createdAt,
    };
  }
}
