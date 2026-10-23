import { test, expect } from '@playwright/test';

// The API must be compiled and running. This test uses its real generated schema
// and bundled Swagger assets under the production Helmet middleware.
const apiOrigin = process.env.E2E_API_URL || 'http://127.0.0.1:5000';

test('Swagger renders real API operations, assets and JWT authorization', async ({
  page,
  request,
}) => {
  const redirect = await request.get(`${apiOrigin}/docs?next=https://example.test`, {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe('/api/docs');

  const errors: string[] = [];
  const assets = new Map<string, number>();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (/\/api\/docs\/swagger-ui[^/]*\.(js|css)$/.test(path)) assets.set(path, response.status());
  });
  const response = await page.goto(`${apiOrigin}/docs`);
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(`${apiOrigin}/api/docs`);
  await expect(page.locator('.swagger-ui .info .title')).toContainText('SammTech AI OS API');
  await expect(page.locator('.swagger-ui .opblock').first()).toBeVisible();
  expect(await page.locator('.swagger-ui .opblock').count()).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Authorize', exact: true }).first().click();
  await expect(page.locator('.dialog-ux')).toContainText('access-token');
  await expect(page.locator('.dialog-ux input')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(assets.get('/api/docs/swagger-ui.css')).toBe(200);
  expect(assets.get('/api/docs/swagger-ui-bundle.js')).toBe(200);
  expect(assets.get('/api/docs/swagger-ui-init.js')).toBe(200);
  expect(errors).toEqual([]);

  const spec = await request.get(`${apiOrigin}/api/docs-json`);
  expect(spec.status()).toBe(200);
  const schema = await spec.json();
  expect(schema.paths['/auth/login']).toBeTruthy();
  expect(schema.paths['/boards']).toBeTruthy();
  expect(schema.paths['/tasks/{id}']).toBeTruthy();
  expect(schema.components.securitySchemes['access-token']).toMatchObject({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  expect((await request.get(`${apiOrigin}/api/api/docs`)).status()).toBe(404);
});
