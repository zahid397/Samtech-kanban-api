import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiBearerAuth } from '@nestjs/swagger';
import request from 'supertest';
import helmet from 'helmet';
import { configureDocumentation } from '../src/documentation';

@ApiBearerAuth('access-token')
@Controller('example')
class ExampleController {
  @Get()
  example() {
    return { ok: true };
  }
}
@Module({ controllers: [ExampleController] })
class DocumentationTestModule {}

test('documentation keeps fixed canonical paths, assets and JWT schema with an API prefix', async () => {
  const app = await NestFactory.create(DocumentationTestModule, { logger: false });
  app.use(helmet());
  app.setGlobalPrefix('api');
  configureDocumentation(app);
  await app.init();
  try {
    const server = app.getHttpServer();
    await request(server)
      .get('/docs?next=https://example.test')
      .expect(308)
      .expect('Location', '/api/docs');
    await request(server).get('/docs/').expect(308).expect('Location', '/api/docs');
    await request(server).get('/api/docs').expect(200).expect('Content-Type', /html/);
    for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
      await request(server).get(`/api/docs/${asset}`).expect(200);
    }
    const response = await request(server).get('/api/docs-json').expect(200);
    assert.ok(response.body.paths['/api/example']);
    assert.equal(response.body.components.securitySchemes['access-token'].scheme, 'bearer');
    assert.equal(response.body.components.securitySchemes['access-token'].bearerFormat, 'JWT');
    assert.deepEqual(response.body.paths['/api/example'].get.security, [{ 'access-token': [] }]);
    await request(server).get('/api/api/docs').expect(404);
  } finally {
    await app.close();
  }
});
