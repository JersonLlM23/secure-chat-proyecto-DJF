import * as argon2 from 'argon2';

/*
 * Parámetros Argon2id explícitos (línea base OWASP):
 * 19 MiB de memoria, 2 iteraciones y paralelismo 1.
 */
export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    ...ARGON2_OPTIONS,
    raw: false,
  });
}

export function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}
