import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { StegoAnalysisIdDefault1760000001000 } from './1760000001000-StegoAnalysisIdDefault.js';

function createQueryRunner() {
  const query = vi.fn();

  return {
    query,
    runner: { query } as unknown as QueryRunner,
  };
}

describe('StegoAnalysisIdDefault1760000001000', () => {
  it('agrega gen_random_uuid() cuando la columna no tiene DEFAULT', async () => {
    const { query, runner } = createQueryRunner();

    query.mockResolvedValueOnce([{ column_default: null }]);

    await new StegoAnalysisIdDefault1760000001000().up(runner);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('information_schema.columns'),
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'ALTER COLUMN "id" SET DEFAULT gen_random_uuid()',
      ),
    );
  });

  it('no modifica la tabla si el DEFAULT ya usa gen_random_uuid()', async () => {
    const { query, runner } = createQueryRunner();

    query.mockResolvedValueOnce([{ column_default: 'gen_random_uuid()' }]);

    await new StegoAnalysisIdDefault1760000001000().up(runner);

    expect(query).toHaveBeenCalledOnce();
  });

  it('no modifica la tabla si el DEFAULT ya usa uuid_generate_v4()', async () => {
    const { query, runner } = createQueryRunner();

    query.mockResolvedValueOnce([{ column_default: 'uuid_generate_v4()' }]);

    await new StegoAnalysisIdDefault1760000001000().up(runner);

    expect(query).toHaveBeenCalledOnce();
  });

  it('falla claramente si no existe la columna id', async () => {
    const { query, runner } = createQueryRunner();

    query.mockResolvedValueOnce([]);

    await expect(
      new StegoAnalysisIdDefault1760000001000().up(runner),
    ).rejects.toThrow('No existe public.stego_analysis.id');

    expect(query).toHaveBeenCalledOnce();
  });

  it('down elimina solo el DEFAULT, sin tocar datos', async () => {
    const { query, runner } = createQueryRunner();

    await new StegoAnalysisIdDefault1760000001000().down(runner);

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ALTER COLUMN "id" DROP DEFAULT'),
    );
  });
});
