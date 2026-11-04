import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password (Argon2id)', () => {
  it('genera un hash Argon2id y no almacena el texto plano', async () => {
    const hash = await hashPassword('ClaveSegura2026!');

    expect(hash).not.toBe('ClaveSegura2026!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('valida la contraseña correcta', async () => {
    const hash = await hashPassword('ClaveSegura2026!');

    await expect(verifyPassword(hash, 'ClaveSegura2026!')).resolves.toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('ClaveSegura2026!');

    await expect(verifyPassword(hash, 'OtraClave2026!')).resolves.toBe(false);
  });
});
