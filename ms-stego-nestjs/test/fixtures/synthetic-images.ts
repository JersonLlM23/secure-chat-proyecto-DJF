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
   * La decodificación real se prueba con PNG.
   */
  return Buffer.concat([
    Buffer.from([0x42, 0x4d]),
    Buffer.alloc(62, 0),
  ]);
}
