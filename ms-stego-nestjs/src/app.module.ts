import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envSchema } from './config/env.schema.js';
import { RequestIdMiddleware } from './common/middleware/request-id/request-id.middleware.js';
import { HealthModule } from './health/health.module.js';
import { StegoModule } from './stego/stego.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envSchema,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],

      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: Number(config.getOrThrow('DB_PORT')),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_DATABASE'),
        autoLoadEntities: true,

        /*
         * Coherente con la migracion correctiva: el UUID de
         * stego_analysis.id lo genera PostgreSQL con gen_random_uuid().
         */
        uuidExtension: 'pgcrypto',

        /*
         * Secure by Design:
         * nunca modificar automáticamente
         * el esquema. Los cambios se aplican
         * mediante migraciones.
         */
        synchronize: false,
        retryAttempts: 5,
        retryDelay: 2000,
        logging: ['error'],
        ssl:
          config.get<string>('DB_SSL') === 'true'
            ? {
                rejectUnauthorized: true,
              }
            : false,
        extra: {
          max: 10,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
        },
      }),
    }),

    StegoModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
