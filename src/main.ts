import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { configureDocumentation } from './documentation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use('/voice/transcribe', json({ limit: '6mb' }));
  app.use(json({ limit: '128kb' }));
  app.use(urlencoded({ extended: false, limit: '128kb' }));

  app.enableShutdownHooks();
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));
  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
    credentials: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  configureDocumentation(app);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📚 Swagger docs available at /api/docs`);
}
bootstrap().catch(() => {
  console.error('Startup failed. Verify database connectivity and required configuration.');
  process.exitCode = 1;
});
