import { readFileSync } from 'node:fs';

import { ConfigService } from '@nestjs/config';

/*
 * STEGO solo dispone de la clave pública RSA. La clave privada
 * permanece exclusivamente en AUTH.
 */
export function loadJwtPublicKey(config: ConfigService): string {
  const path = config.getOrThrow<string>('JWT_PUBLIC_KEY_PATH');

  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `No se pudo leer la clave pública RSA en "${path}". Verifique JWT_PUBLIC_KEY_PATH.`,
    );
  }
}
