import { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

import { StegoAnalysis } from '../entities/stego-analysis.entity.js';
import { StegoAction } from '../enums/stego-action.enum.js';
import { StegoStatus } from '../enums/stego-status.enum.js';
import { StegoAnalysisService } from './stego-analysis.service.js';

function createRepositoryMock() {
  const create = vi.fn((data: Partial<StegoAnalysis>) => data);

  const save = vi.fn((entity) => Promise.resolve(entity));

  const findOne = vi.fn();

  return {
    repository: {
      create,
      save,
      findOne,
    } as unknown as Repository<StegoAnalysis>,
    create,
    save,
    findOne,
  };
}

describe('StegoAnalysisService (persistencia)', () => {
  it('crea y guarda un análisis', async () => {
    const { repository, create, save } = createRepositoryMock();

    const service = new StegoAnalysisService(repository);

    const result = await service.create({
      userId: '44444444-4444-4444-8444-444444444444',
      filename: 'imagen.png',
      sha256: 'a'.repeat(64),
      technique: 'lsb_statistical_analysis',
      status: StegoStatus.SIN_INDICIOS,
      action: StegoAction.ACEPTADO,
      indicators: { anomalyScore: 0.1 },
      limitations: 'limitaciones',
    });

    expect(create).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(result.status).toBe(StegoStatus.SIN_INDICIOS);
  });

  it('busca por id sin acceder a datos de AUTH', async () => {
    const { repository, findOne } = createRepositoryMock();

    const expected = { id: 'id-1' } as StegoAnalysis;

    findOne.mockResolvedValue(expected);

    const service = new StegoAnalysisService(repository);

    await expect(service.findById('id-1')).resolves.toBe(expected);

    expect(findOne).toHaveBeenCalledWith({
      where: { id: 'id-1' },
    });
  });
});
