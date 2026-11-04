import { readFileSync } from 'node:fs';

import { ConfigService } from '@nestjs/config';

function readKey(path: string, label: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `No se pudo leer ${label} en "${path}". Verifique JWT_PRIVATE_KEY_PATH y JWT_PUBLIC_KEY_PATH.`,
    );
  }
}

export function loadJwtPrivateKey(config: ConfigService): string {
  return readKey(
    config.getOrThrow<string>('JWT_PRIVATE_KEY_PATH'),
    'la clave privada RSA',
  );
}

export function loadJwtPublicKey(config: ConfigService): string {
  return readKey(
    config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH'),
    'la clave pública RSA',
  );
}
