import {
  ClassSerializerInterceptor,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/all-exceptions/all-exceptions.filter.js';

/*
 * Configuración HTTP compartida por main.ts y las pruebas e2e, de modo
 * que ambas ejecuten exactamente el mismo comportamiento (prefijo,
 * versionado, validación, serialización, filtros y CORS).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV');

  /*
   * Encabezados HTTP de seguridad.
   */
  app.useSecurityHeaders();

  /*
   * Solamente confiar en un proxy
   * expresamente configurado.
   */
  const trustProxy = config.get<string>('TRUST_PROXY');

  if (trustProxy) {
    app.set('trust proxy', trustProxy);
  }

  /*
   * CORS restrictivo. X-Service-Key no se expone a navegadores: el
   * endpoint interno es servicio-a-servicio.
   */
  const origins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Request-Id'],
    credentials: false,
    maxAge: 86400,
  });

  /*
   * Rechazar propiedades no declaradas.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
      disableErrorMessages: nodeEnv === 'production',
    }),
  );

  /*
   * Defensa adicional para campos
   * @Exclude().
   */
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  /*
   * Rutas de negocio: /api/...
   *
   * El endpoint interno servicio-a-servicio queda fuera del prefijo
   * global y se expone en /internal/authorization/check.
   */
  app.setGlobalPrefix('api', {
    exclude: [
      {
        path: 'internal/authorization/check',
        method: RequestMethod.POST,
      },
    ],
  });
}
