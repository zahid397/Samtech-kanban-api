import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Request, Response } from 'express';

/** Keep documentation URLs stable independently of application route prefixes. */
export function configureDocumentation(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('SammTech AI OS API')
    .setDescription(
      'Authorized Kanban workspace, Python intelligence gateway, audit logs, agents and persistent automation.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: 'api/docs-json',
  });

  // The destination is fixed: query strings cannot create an open redirect.
  app.getHttpAdapter().get('/docs', (_request: Request, response: Response) => {
    response.redirect(308, '/api/docs');
  });
  return document;
}
