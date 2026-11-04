import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { StegoAction } from '../enums/stego-action.enum.js';
import { StegoStatus } from '../enums/stego-status.enum.js';

@Entity('stego_analysis')
@Index('IDX_stego_analysis_user_id', ['userId'])
@Index('IDX_stego_analysis_sha256', ['sha256'])
@Index('IDX_stego_analysis_created_at', ['createdAt'])
export class StegoAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /*
   * Identidad tomada exclusivamente del claim `sub` del JWT.
   */
  @Column({ name: 'userId', type: 'uuid' })
  userId!: string;

  @Column({ name: 'filename', type: 'varchar', length: 255 })
  filename!: string;

  @Column({ name: 'sha256', type: 'varchar', length: 64 })
  sha256!: string;

  @Column({ name: 'technique', type: 'varchar', length: 100 })
  technique!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: StegoStatus,
    enumName: 'stego_analysis_status_enum',
  })
  status!: StegoStatus;

  @Column({ name: 'indicators', type: 'jsonb' })
  indicators!: Record<string, unknown>;

  @Column({
    name: 'action',
    type: 'enum',
    enum: StegoAction,
    enumName: 'stego_analysis_action_enum',
  })
  action!: StegoAction;

  @Column({ name: 'limitations', type: 'text' })
  limitations!: string;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt!: Date;
}
