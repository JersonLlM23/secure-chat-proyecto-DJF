import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'node:path';

export type SupportedImageFormat = 'png' | 'bmp';

export interface ValidatedFile {
  format: SupportedImageFormat;
  extension: '.png' | '.bmp';
  filename: string;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const BMP_SIGNATURE = Buffer.from([0x42, 0x4d]);

const EXTENSION_TO_FORMAT: Record<string, SupportedImageFormat> = {
  '.png': 'png',
  '.bmp': 'bmp',
};

const FILE_SIGNATURES: Record<SupportedImageFormat, Buffer> = {
  png: PNG_SIGNATURE,
  bmp: BMP_SIGNATURE,
};

function sanitizeFilename(originalname: string): string {
  const basename = originalname.split(/[\\/]/).pop() ?? 'image';

  const cleaned = Array.from(basename)
    .filter((character) => {
      const code = character.charCodeAt(0);

      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, 255);

  return cleaned.length > 0 ? cleaned : 'image';
}

@Injectable()
export class FileValidationService {
  private readonly maxFileSizeBytes: number;

  constructor(config: ConfigService) {
    this.maxFileSizeBytes = config.getOrThrow<number>('MAX_FILE_SIZE_BYTES');
  }

  /*
   * El Content-Type declarado por el cliente no se utiliza: la
   * decisión se basa en extensión + magic bytes reales.
   */
  validate(file: Express.Multer.File | undefined): ValidatedFile {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Archivo requerido');
    }

    if (
      file.buffer.length > this.maxFileSizeBytes ||
      file.size > this.maxFileSizeBytes
    ) {
      throw new PayloadTooLargeException(
        `El archivo excede MAX_FILE_SIZE_BYTES (${this.maxFileSizeBytes} bytes)`,
      );
    }

    const filename = sanitizeFilename(file.originalname);

    const extension = extname(filename).toLowerCase();

    const format = EXTENSION_TO_FORMAT[extension];

    if (!format) {
      throw new UnsupportedMediaTypeException(
        'Formato no soportado. Solo se aceptan .png y .bmp',
      );
    }

    const signature = FILE_SIGNATURES[format];

    if (
      file.buffer.length < signature.length ||
      !file.buffer.subarray(0, signature.length).equals(signature)
    ) {
      throw new UnsupportedMediaTypeException(
        'El contenido real del archivo no coincide con su extensión',
      );
    }

    return {
      format,
      extension: extension as '.png' | '.bmp',
      filename,
    };
  }
}
