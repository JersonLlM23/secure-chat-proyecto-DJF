import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';

import { StegoAnalysis } from '../entities/stego-analysis.entity.js';

/*
 * Persistencia propia de STEGO. No existe acceso a tablas de AUTH.
 */
@Injectable()
export class StegoAnalysisService {
  constructor(
    @InjectRepository(StegoAnalysis)
    private readonly repository: Repository<StegoAnalysis>,
  ) {}

  async create(data: Partial<StegoAnalysis>): Promise<StegoAnalysis> {
    const entity = this.repository.create(data);
    const toSave = entity.id ? entity : { ...entity, id: randomUUID() };

    return this.repository.save(toSave as StegoAnalysis);
  }

  async findById(id: string): Promise<StegoAnalysis | null> {
    return this.repository.findOne({
      where: { id },
    });
  }
}
