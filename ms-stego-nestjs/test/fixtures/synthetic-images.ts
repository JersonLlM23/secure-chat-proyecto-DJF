import sharp from 'sharp';

/*
 * Imágenes sintéticas controladas y deterministas. No se utiliza
 * Math.random(): el payload LSB proviene de un LCG con semilla fija.
 */

export function createHostRaw(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const offset = (y * width + x) * 3 + channel;

        /*
         * Todos los valores son pares (LSB = 0) y solo se usan 8
         * niveles, lo que produce un host de baja entropía LSB.
         */
        data[offset] = 128 + (((x + y + channel) % 8) * 2);
      }
    }
  }

  return data;
}

export function createDeterministicPayload(length: number): Buffer {
  const payload = Buffer.alloc(length);

  let state = 0x12345678;

  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    payload[index] = state & 0xff;
  }

  return payload;
}

export function embedLsbPayload(raw: Buffer, payload: Buffer): Buffer {
  const output = Buffer.from(raw);

  const totalBits = Math.min(raw.length, payload.length * 8);

  for (let bitIndex = 0; bitIndex < totalBits; bitIndex += 1) {
    const payloadByte = payload[bitIndex >> 3];
    const bit = (payloadByte >> (7 - (bitIndex & 7))) & 1;

    output[bitIndex] = (output[bitIndex] & 0xfe) | bit;
  }

  return output;
}

async function encodePng(
  raw: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(raw, {
    raw: {
      width,
      height,
      channels: 3,
    },
  })
    .png()
    .toBuffer();
}

export async function createHostPng(
  width = 64,
  height = 64,
): Promise<Buffer> {
  return encodePng(createHostRaw(width, height), width, height);
}

export async function createLsbEmbeddedPng(
  width = 64,
  height = 64,
): Promise<Buffer> {
  const raw = createHostRaw(width, height);

  const payload = createDeterministicPayload(Math.ceil(raw.length / 8));

  return encodePng(embedLsbPayload(raw, payload), width, height);
}

export function createBmpHeader(): Buffer {
  /*
   * Cabecera mínima suficiente para validar los magic bytes BM.
   */
  return Buffer.concat([
    Buffer.from([0x42, 0x4d]),
    Buffer.alloc(62, 0),
  ]);
}

export interface BmpOptions {
  bitPP?: 24 | 32;
  topDown?: boolean;
}

/*
 * Codifica píxeles RGB en un BMP sin compresión (BI_RGB). Se usa para
 * probar que el análisis LSB produce las mismas métricas que el PNG
 * equivalente, independientemente del contenedor.
 */
export function createBmpFromRgb(
  rgb: Buffer,
  width: number,
  height: number,
  options: BmpOptions = {},
): Buffer {
  const bitPP = options.bitPP ?? 24;
  const topDown = options.topDown ?? false;
  const bytesPerPixel = bitPP / 8;
  const rowSize = Math.floor((bitPP * width + 31) / 32) * 4;
  const pixelSize = rowSize * height;
  const headerSize = 40;
  const offset = 14 + headerSize;
  const buffer = Buffer.alloc(offset + pixelSize);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(offset, 10);
  buffer.writeUInt32LE(headerSize, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(topDown ? -height : height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(bitPP, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelSize, 34);

  for (let y = 0; y < height; y += 1) {
    const sourceY = topDown ? y : height - 1 - y;
    const rowStart = offset + y * rowSize;

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 3;
      const targetOffset = rowStart + x * bytesPerPixel;

      buffer[targetOffset] = rgb[sourceOffset + 2];
      buffer[targetOffset + 1] = rgb[sourceOffset + 1];
      buffer[targetOffset + 2] = rgb[sourceOffset];

      if (bitPP === 32) {
        buffer[targetOffset + 3] = 0xff;
      }
    }
  }

  return buffer;
}

export async function createHostBmp(
  width = 64,
  height = 64,
  options: BmpOptions = {},
): Promise<Buffer> {
  return createBmpFromRgb(
    createHostRaw(width, height),
    width,
    height,
    options,
  );
}

/*
 * BMP de 8 bits con paleta. El patrón es determinista y no pretende
 * representar una imagen natural, solo ejercitar la decodificación de
 * índices de paleta y la normalización a RGB.
 */
export function createIndexedBmp(width = 16, height = 16): Buffer {
  const paletteCount = 256;
  const rowSize = Math.floor((8 * width + 31) / 32) * 4;
  const pixelSize = rowSize * height;
  const offset = 14 + 40 + paletteCount * 4;
  const buffer = Buffer.alloc(offset + pixelSize);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(offset, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(8, 28);
  buffer.writeUInt32LE(pixelSize, 34);
  buffer.writeUInt32LE(paletteCount, 46);

  for (let index = 0; index < paletteCount; index += 1) {
    const entry = 14 + 40 + index * 4;

    buffer[entry] = index;
    buffer[entry + 1] = 255 - index;
    buffer[entry + 2] = (index * 3) & 0xff;
  }

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const rowStart = offset + y * rowSize;

    for (let x = 0; x < width; x += 1) {
      buffer[rowStart + x] = (x * 11 + sourceY * 13) & 0xff;
    }
  }

  return buffer;
}

/*
 * BMP de 16 bits con máscaras 5-5-5 por defecto (BI_RGB).
 */
export function create16BitBmp(width = 16, height = 16): Buffer {
  const rowSize = Math.floor((16 * width + 31) / 32) * 4;
  const pixelSize = rowSize * height;
  const offset = 14 + 40;
  const buffer = Buffer.alloc(offset + pixelSize);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(offset, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(16, 28);
  buffer.writeUInt32LE(pixelSize, 34);

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const rowStart = offset + y * rowSize;

    for (let x = 0; x < width; x += 1) {
      const red = (x * 7) & 0x1f;
      const green = (sourceY * 5) & 0x1f;
      const blue = (x * 3 + sourceY) & 0x1f;

      buffer.writeUInt16LE(
        (red << 10) | (green << 5) | blue,
        rowStart + x * 2,
      );
    }
  }

  return buffer;
}

/*
 * Cabecera OS/2 BITMAPCOREHEADER (12 bytes), válida en el formato BMP
 * pero no soportada por el decodificador.
 */
export function createOs2CoreBmp(): Buffer {
  const buffer = Buffer.alloc(14 + 12 + 16);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(14 + 12, 10);
  buffer.writeUInt32LE(12, 14);
  buffer.writeUInt16LE(2, 18);
  buffer.writeUInt16LE(2, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt16LE(24, 24);

  return buffer;
}

/*
 * BMP con compresión RLE8 declarada. No se decodifica: el análisis LSB
 * debe rechazarlo como variante no soportada, no como archivo corrupto.
 */
export function createRle8Bmp(): Buffer {
  const buffer = createIndexedBmp(4, 4);

  buffer.writeUInt32LE(1, 30);

  return buffer;
}
