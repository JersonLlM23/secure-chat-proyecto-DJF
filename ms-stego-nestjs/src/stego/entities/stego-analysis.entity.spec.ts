import { getMetadataArgsStorage } from 'typeorm';
import { describe, expect, it } from 'vitest';

import { StegoAnalysis } from './stego-analysis.entity.js';

describe('StegoAnalysis entity', () => {
  it('declara id como UUID generado por la base de datos', () => {
    const storage = getMetadataArgsStorage();

    const generation = storage.generations.find(
      (item) =>
        item.target === StegoAnalysis && item.propertyName === 'id',
    );

    const column = storage.columns.find(
      (item) =>
        item.target === StegoAnalysis && item.propertyName === 'id',
    );

    expect(generation?.strategy).toBe('uuid');
    expect(column?.options.primary).toBe(true);
    expect(column?.options.type).toBe('uuid');
  });
});
