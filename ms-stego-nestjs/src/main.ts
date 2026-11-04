import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV');

  const swaggerEnabled = config.get<string>('SWAGGER_ENABLED') === 'true';

  configureApp(app);

  /*
   * Swagger/OpenAPI habilitado únicamente cuando SWAGGER_ENABLED=true.
   */
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('STEGO Service')
      .setDescription(
        'Microservicio de esteganografía LSB para ocultar y extraer mensajes en imágenes',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();
  const port = config.get<number>('PORT') ?? 3002;
  await app.listen(port);
  console.log(`STEGO Service: http://localhost:${port}/api`);
  if (swaggerEnabled) {
    console.log(`Swagger: http://localhost:${port}/docs`);
  }
  if (nodeEnv !== 'production') {
    console.log(`Health: http://localhost:${port}/api/health`);
    console.log(
      `Analyze: POST http://localhost:${port}/api/steganography/analyze`,
    );
  }
}

await bootstrap();
