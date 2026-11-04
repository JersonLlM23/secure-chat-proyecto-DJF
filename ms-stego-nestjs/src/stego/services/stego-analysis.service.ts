import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

    return this.repository.save(entity);
  }

  async findById(id: string): Promise<StegoAnalysis | null> {
    return this.repository.findOne({
      where: { id },
    });
  }
}
