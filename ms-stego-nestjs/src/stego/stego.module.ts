import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';

import { AuthModule } from '../auth/auth.module.js';
import { StegoAnalysis } from './entities/stego-analysis.entity.js';
import { FileValidationService } from './services/file-validation.service.js';
import { StegoAnalysisService } from './services/stego-analysis.service.js';
import { SteganographyService } from './services/steganography.service.js';
import { StegoController } from './stego.controller.js';
import { StegoService } from './stego.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([StegoAnalysis]),
    AuthModule,

    /*
     * El límite de multipart se toma exclusivamente de
     * MAX_FILE_SIZE_BYTES y se mantiene en memoria.
     */
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: {
          fileSize: config.getOrThrow<number>('MAX_FILE_SIZE_BYTES'),
        },
      }),
    }),
  ],
  controllers: [StegoController],
  providers: [
    StegoService,
    FileValidationService,
    SteganographyService,
    StegoAnalysisService,
  ],
})
export class StegoModule {}
