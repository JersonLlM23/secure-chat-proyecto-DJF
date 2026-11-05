import { decode } from 'bmp-ts';

import type { BmpCompression } from 'bmp-ts';

export const BMP_SIGNATURE = Buffer.from([0x42, 0x4d]);

const SUPPORTED_HEADER_SIZES = new Set([40, 52, 56, 108, 124]);

const SUPPORTED_BIT_DEPTHS = new Set([1, 4, 8, 16, 24, 32]);

/*
 * bmp-ts implementa BI_RGB y BI_BITFIELDS de forma consistente. Los
 * métodos RLE (BI_RLE4/BI_RLE8) construyen los píxeles con un
 * desplazamiento incorrecto, por lo que se rechazan explícitamente en
 * lugar de entregar colores corruptos al análisis LSB.
 */
const SUPPORTED_COMPRESSIONS = new Set([0, 3, 6]);

export interface BmpHeader {
  headerSize: number;
  width: number;
  height: number;
  bitPP: number;
  compression: number;
}

export interface DecodedBmp {
  data: Buffer;
  width: number;
  height: number;
}

export type BmpDecodeFailure =
  | { kind: 'malformed'; detail: string }
  | { kind: 'unsupported'; detail: string };

export class BmpDecodeError extends Error {
  constructor(readonly failure: BmpDecodeFailure) {
    super(failure.detail);
    this.name = 'BmpDecodeError';
  }
}

export function isBmp(buffer: Buffer): boolean {
  return (
    buffer.length >= BMP_SIGNATURE.length &&
    buffer.subarray(0, BMP_SIGNATURE.length).equals(BMP_SIGNATURE)
  );
}

/*
 * Lee únicamente la cabecera. Los límites de tamaño se aplican antes
 * de invocar al decodificador, que reserva width * height * 4 bytes.
 */
export function readBmpHeader(buffer: Buffer): BmpHeader {
  if (!isBmp(buffer) || buffer.length < 26) {
    throw new BmpDecodeError({
      kind: 'malformed',
      detail: 'cabecera BMP incompleta',
    });
  }

  const headerSize = buffer.readUInt32LE(14);

  /*
   * La cabecera OS/2 BITMAPCOREHEADER (12 bytes) no está soportada por
   * bmp-ts; se distingue de un archivo corrupto.
   */
  if (headerSize === 12) {
    throw new BmpDecodeError({
      kind: 'unsupported',
      detail: 'cabecera OS/2 BITMAPCOREHEADER (12 bytes)',
    });
  }

  if (!SUPPORTED_HEADER_SIZES.has(headerSize)) {
    throw new BmpDecodeError({
      kind: 'unsupported',
      detail: `cabecera BMP de ${headerSize} bytes`,
    });
  }

  if (buffer.length < 14 + headerSize) {
    throw new BmpDecodeError({
      kind: 'malformed',
      detail: 'cabecera BMP truncada',
    });
  }

  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const bitPP = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);

  if (width <= 0 || rawHeight === 0) {
    throw new BmpDecodeError({
      kind: 'malformed',
      detail: 'dimensiones BMP inválidas',
    });
  }

  if (!SUPPORTED_BIT_DEPTHS.has(bitPP)) {
    throw new BmpDecodeError({
      kind: 'unsupported',
      detail: `${bitPP} bits por píxel`,
    });
  }

  if (!SUPPORTED_COMPRESSIONS.has(compression)) {
    throw new BmpDecodeError({
      kind: 'unsupported',
      detail: `compresión BMP ${compression}`,
    });
  }

  return {
    headerSize,
    width,
    height: Math.abs(rawHeight),
    bitPP,
    compression,
  };
}

/*
 * bmp-ts entrega los píxeles en formato ABGR (canal alfa primero),
 * incluso cuando se solicita toRGBA. Se normaliza a RGBA para que
 * Sharp aplique después la conversión a sRGB y la eliminación de alfa.
 */
function abgrToRgba(source: Buffer, pixelCount: number): Buffer {
  const target = Buffer.alloc(pixelCount * 4);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceOffset = pixel * 4;
    const targetOffset = pixel * 4;

    target[targetOffset] = source[sourceOffset + 3];
    target[targetOffset + 1] = source[sourceOffset + 2];
    target[targetOffset + 2] = source[sourceOffset + 1];
    target[targetOffset + 3] = 0xff;
  }

  return target;
}

export function decodeBmp(buffer: Buffer): DecodedBmp {
  const header = readBmpHeader(buffer);

  let decoded: ReturnType<typeof decode>;

  try {
    decoded = decode(buffer);
  } catch (error) {
    throw new BmpDecodeError({
      kind: 'malformed',
      detail:
        error instanceof Error ? error.message : 'error desconocido de bmp-ts',
    });
  }

  const width = decoded.width;
  const height = Math.abs(decoded.height);
  const pixelCount = width * height;

  if (
    width !== header.width ||
    height !== header.height ||
    decoded.bitPP !== header.bitPP ||
    (decoded.compression ?? 0) !== (header.compression as BmpCompression)
  ) {
    throw new BmpDecodeError({
      kind: 'malformed',
      detail: 'la cabecera decodificada no coincide con la declarada',
    });
  }

  if (decoded.data.length !== pixelCount * 4) {
    throw new BmpDecodeError({
      kind: 'malformed',
      detail: 'el búfer decodificado tiene un tamaño inesperado',
    });
  }

  return {
    data: abgrToRgba(decoded.data, pixelCount),
    width,
    height,
  };
}
