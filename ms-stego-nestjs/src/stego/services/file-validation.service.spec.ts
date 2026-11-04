import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { createBmpHeader, createHostPng } from '../../../test/fixtures/synthetic-images.js';
import { FileValidationService } from './file-validation.service.js';

const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createService(maxFileSizeBytes = 1024): FileValidationService {
  return new FileValidationService({
    getOrThrow: () => maxFileSizeBytes,
  } as unknown as ConfigService);
}

function createFile(
  buffer: Buffer,
  originalname: string,
  mimetype = 'application/octet-stream',
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.length,
    buffer,
  } as unknown as Express.Multer.File;
}

describe('FileValidationService', () => {
  it('acepta PNG por magic bytes y extensión', () => {
    const result = createService().validate(
      createFile(Buffer.concat([PNG_MAGIC, Buffer.from('data')]), 'foto.PNG'),
    );

    expect(result.format).toBe('png');
    expect(result.extension).toBe('.png');
  });

  it('acepta BMP por magic bytes y extensión', () => {
    const result = createService().validate(
      createFile(createBmpHeader(), 'foto.bmp'),
    );

    expect(result.format).toBe('bmp');
  });

  it('ignora el Content-Type declarado por el cliente', () => {
    const result = createService().validate(
      createFile(
        Buffer.concat([PNG_MAGIC, Buffer.alloc(8)]),
        'foto.png',
        'text/plain',
      ),
    );

    expect(result.format).toBe('png');
  });

  it('rechaza extensión que no coincide con los magic bytes', () => {
    expect(() =>
      createService().validate(
        createFile(Buffer.concat([PNG_MAGIC, Buffer.alloc(8)]), 'foto.bmp'),
      ),
    ).toThrow(UnsupportedMediaTypeException);
  });

  it('rechaza formatos no soportados', () => {
    expect(() =>
      createService().validate(createFile(Buffer.alloc(16), 'foto.jpg')),
    ).toThrow(UnsupportedMediaTypeException);
  });

  it('rechaza archivos que superan MAX_FILE_SIZE_BYTES', async () => {
    const png = await createHostPng(8, 8);

    expect(() =>
      createService(16).validate(createFile(png, 'foto.png')),
    ).toThrow(PayloadTooLargeException);
  });

  it('rechaza archivos vacíos o ausentes', () => {
    expect(() => createService().validate(undefined)).toThrow(
      BadRequestException,
    );
    expect(() =>
      createService().validate(createFile(Buffer.alloc(0), 'foto.png')),
    ).toThrow(BadRequestException);
  });

  it('sanea rutas y caracteres de control del nombre original', () => {
    const result = createService().validate(
      createFile(
        Buffer.concat([PNG_MAGIC, Buffer.alloc(8)]),
        '..\\..\\evil\u0000name.png',
      ),
    );

    expect(result.filename).toBe('evilname.png');
  });
});
