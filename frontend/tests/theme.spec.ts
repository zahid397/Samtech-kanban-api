import { test, expect } from './support/test';

test('account profile uses signed-in data and appearance persists through refresh and login', async ({
  page,
}) => {
  const email = `appearance-${Date.now()}@example.test`;
  const password = 'Appearance-test-pass123';
  await page.addInitScript(() => {
    if (!localStorage.getItem('sammtech-preferences')) {
      localStorage.setItem(
        'sammtech-preferences',
        JSON.stringify({
          state: {
            theme: 'dark',
            lowPerformance: true,
            reducedMotion: true,
            voice: false,
            localVoice: false,
          },
          version: 0,
        }),
      );
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Appearance Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Appearance/ })).toBeVisible();
  await page.getByRole('button', { name: 'View profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
  await expect(page.locator('.profile-details')).toContainText('Appearance Tester');
  await expect(page.locator('.profile-details')).toContainText(email);
  await page
    .getByRole('combobox', { name: 'Workspace appearance', exact: true })
    .selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    'light',
  );
  await page.screenshot({ path: 'test-results/light-settings-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/light-settings-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.', exact: true })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Appearance/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
