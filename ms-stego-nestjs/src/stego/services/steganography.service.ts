import {
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

import type {
  ChannelMetrics,
  SteganographyMetrics,
} from '../interfaces/steganography-metrics.interface.js';

interface RawImageInfo {
  width: number;
  height: number;
  channels: number;
}

export class ImageDecodingError extends Error {
  constructor() {
    super('No se pudo decodificar la imagen');
    this.name = 'ImageDecodingError';
  }
}

export const ANALYSIS_METHOD = 'lsb_statistical_analysis';

export const ANALYSIS_LIMITATIONS =
  'Resultado indicativo mediante análisis estadístico de los bits menos significativos (PoV, chi-cuadrado y entropía). No es prueba definitiva de esteganografía ni identifica el payload. Los umbrales son criterios experimentales que requieren calibración con un corpus representativo.';

/*
 * Métricas agregadas sobre los bytes RGB (canal alfa excluido).
 *
 * - Entropía LSB: H = -Σ p(b) log2 p(b), con p(b) tomada de las
 *   frecuencias reales de bits 0 y 1. Rango [0, 1]; 1 indica bits
 *   equiprobables, algo esperable tanto en imágenes naturales ruidosas
 *   como en imágenes con LSB reemplazados, por lo que no es concluyente.
 *
 * - PoV (Pair of Values): para cada par (2i, 2i+1) de valores de byte se
 *   mide el desbalance |count(2i) - count(2i+1)| / total del par. El score
 *   es 1 - Σ|diferencia| / totalBytes, en [0, 1]. Un score alto indica
 *   pares equilibrados, patrón compatible con reemplazo LSB, pero también
 *   con imágenes de baja textura o degradados.
 *
 * - Chi-cuadrado PoV: para cada par no vacío, E = total/2 y
 *   χ² = Σ (O - E)² / E sobre ambos valores. Los grados de libertad son
 *   (pares no vacíos - 1). El p-valor se aproxima con Wilson-Hilferty;
 *   un p-valor alto indica que los pares son compatibles con el
 *   equilibrio esperado bajo reemplazo LSB.
 *
 * - anomalyScore = 0.45 * entropía + 0.45 * PoV + 0.10 * p-valor χ².
 *   El chi-cuadrado actúa solo como corroboración: con pocos pares su
 *   p-valor es sensible a fluctuaciones muestrales. Es una heurística
 *   transparente y no una probabilidad calibrada.
 */
function computeChannelMetrics(values: Uint8Array): ChannelMetrics {
  let bitZeroCount = 0;
  let bitOneCount = 0;

  const byteCounts = new Uint32Array(256);

  for (const value of values) {
    if ((value & 1) === 0) {
      bitZeroCount += 1;
    } else {
      bitOneCount += 1;
    }

    byteCounts[value] += 1;
  }

  const totalBits = bitZeroCount + bitOneCount;

  let lsbEntropy = 0;

  if (totalBits > 0) {
    const pZero = bitZeroCount / totalBits;
    const pOne = bitOneCount / totalBits;

    if (pZero > 0) {
      lsbEntropy -= pZero * Math.log2(pZero);
    }

    if (pOne > 0) {
      lsbEntropy -= pOne * Math.log2(pOne);
    }
  }

  let balanceSum = 0;
  let chiSquareValue = 0;
  let nonEmptyPairs = 0;

  /*
   * Histograma de bytes para PoV y chi-cuadrado, agrupado por pares
   * (2i, 2i+1).
   */
  for (let pairIndex = 0; pairIndex < 128; pairIndex += 1) {
    const evenCount = byteCounts[pairIndex * 2];
    const oddCount = byteCounts[pairIndex * 2 + 1];
    const total = evenCount + oddCount;

    if (total === 0) {
      continue;
    }

    nonEmptyPairs += 1;
    balanceSum += Math.abs(evenCount - oddCount);

    const expected = total / 2;

    chiSquareValue +=
      ((evenCount - expected) ** 2) / expected +
      ((oddCount - expected) ** 2) / expected;
  }

  const totalBytes = values.length;

  const poVScore = totalBytes > 0 ? 1 - balanceSum / totalBytes : 0;

  const chiSquareDegreesOfFreedom = Math.max(nonEmptyPairs - 1, 0);

  return {
    bitZeroCount,
    bitOneCount,
    lsbEntropy: Math.min(Math.max(lsbEntropy, 0), 1),
    poVScore: Math.min(Math.max(poVScore, 0), 1),
    chiSquareValue,
    chiSquareDegreesOfFreedom,
    chiSquarePValue: chiSquareSurvival(
      chiSquareValue,
      chiSquareDegreesOfFreedom,
    ),
  };
}

function erf(value: number): number {
  /*
   * Aproximación de Abramowitz y Stegun (7.1.26), error absoluto
   * menor que 1.5e-7.
   */
  const sign = value < 0 ? -1 : 1;

  const x = Math.abs(value);

  const t = 1 / (1 + 0.3275911 * x);

  const polynomial =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
      0.284496736) *
      t +
      0.254829592) *
    t;

  return sign * (1 - polynomial * Math.exp(-x * x));
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

/*
 * Aproximación Wilson-Hilferty del p-valor de una χ². Es una
 * aproximación documentada, no un cálculo exacto de la función gamma
 * incompleta.
 */
function chiSquareSurvival(chiSquare: number, degreesOfFreedom: number): number {
  if (degreesOfFreedom <= 0) {
    return 1;
  }

  const adjusted = chiSquare / degreesOfFreedom;

  const z =
    (Math.cbrt(adjusted) - (1 - 2 / (9 * degreesOfFreedom))) /
    Math.sqrt(2 / (9 * degreesOfFreedom));

  return Math.min(Math.max(1 - normalCdf(z), 0), 1);
}

@Injectable()
export class SteganographyService {
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly maxPixels: number;
  private readonly suspiciousThreshold: number;
  private readonly clearThreshold: number;

  constructor(config: ConfigService) {
    this.maxWidth = config.getOrThrow<number>('MAX_IMAGE_WIDTH');
    this.maxHeight = config.getOrThrow<number>('MAX_IMAGE_HEIGHT');
    this.maxPixels = config.getOrThrow<number>('MAX_IMAGE_PIXELS');
    this.suspiciousThreshold = config.getOrThrow<number>(
      'STEGO_SUSPICIOUS_THRESHOLD',
    );
    this.clearThreshold = config.getOrThrow<number>('STEGO_CLEAR_THRESHOLD');
  }

  async analyze(buffer: Buffer): Promise<SteganographyMetrics> {
    let metadata: { width?: number; height?: number };

    try {
      /*
       * metadata() solo lee cabeceras; no decodifica píxeles. Los
       * límites de decodificación se aplican en la segunda instancia.
       */
      metadata = await sharp(buffer, {
        limitInputPixels: false,
      }).metadata();
    } catch {
      throw new ImageDecodingError();
    }

    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      throw new ImageDecodingError();
    }

    if (
      width > this.maxWidth ||
      height > this.maxHeight ||
      width * height > this.maxPixels
    ) {
      throw new PayloadTooLargeException(
        'La imagen excede las dimensiones o el total de píxeles permitidos',
      );
    }

    let data: Buffer;
    let info: RawImageInfo;

    try {
      const decoded = await sharp(buffer, {
        limitInputPixels: this.maxPixels,
        sequentialRead: true,
      })
        .toColourspace('srgb')
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      data = decoded.data;
      info = {
        width: decoded.info.width,
        height: decoded.info.height,
        channels: decoded.info.channels,
      };
    } catch {
      throw new ImageDecodingError();
    }

    if (info.channels !== 3) {
      throw new ImageDecodingError();
    }

    if (info.width * info.height > this.maxPixels) {
      throw new PayloadTooLargeException(
        'La imagen excede el total de píxeles permitidos',
      );
    }

    const expectedLength = info.width * info.height * 3;

    if (data.length !== expectedLength) {
      throw new ImageDecodingError();
    }

    /*
     * Se analizan los canales RGB de forma agregada y también por canal
     * individual, de manera reproducible y excluyendo alfa.
     */
    const red = new Uint8Array(info.width * info.height);
    const green = new Uint8Array(info.width * info.height);
    const blue = new Uint8Array(info.width * info.height);

    for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
      const offset = pixel * 3;

      red[pixel] = data[offset];
      green[pixel] = data[offset + 1];
      blue[pixel] = data[offset + 2];
    }

    const aggregate = computeChannelMetrics(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );

    const perChannel = {
      red: computeChannelMetrics(red),
      green: computeChannelMetrics(green),
      blue: computeChannelMetrics(blue),
    };

    const anomalyScore = Math.min(
      Math.max(
        0.45 * aggregate.lsbEntropy +
          0.45 * aggregate.poVScore +
          0.1 * aggregate.chiSquarePValue,
        0,
      ),
      1,
    );

    return {
      ...aggregate,
      width: info.width,
      height: info.height,
      analyzedPixels: info.width * info.height,
      analyzedBytes: data.length,
      analyzedBits: data.length,
      anomalyScore,
      threshold: this.suspiciousThreshold,
      perChannel,
    };
  }

  getThresholds(): { suspicious: number; clear: number } {
    return {
      suspicious: this.suspiciousThreshold,
      clear: this.clearThreshold,
    };
  }
}
