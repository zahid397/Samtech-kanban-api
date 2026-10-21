import { test, expect } from '@playwright/test';

test('login → original mascot → Python draft → approved save → refresh persistence', async ({
  page,
  request,
}) => {
  const email = `browser-${Date.now()}@example.test`,
    password = 'Browser-test-pass123';
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Browser Builder');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Browser/ })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Animated 3D Samm robot|Samm, your assistant/ }),
  ).toBeVisible();
  // A screenshot proves the live account dashboard; its metrics begin empty.
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Kanban Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project name').fill('Browser acceptance');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Backlog', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await page.getByLabel('Ask Samm').fill('Create a task called Fix Login Bug by tomorrow urgent');
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve & create' })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Fix Login Bug');
  await expect(page.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue('HIGH');
  const session = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('sammtech-session') || '{}'),
  );
  const before = await request.get('http://127.0.0.1:5000/workspace', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  expect((await before.json()).tasks).toHaveLength(0);
  await page.getByRole('button', { name: 'Approve & create' }).click();
  await expect(page.getByRole('status')).toContainText('Your tasks have been created and saved');
  await page.getByRole('button', { name: 'Kanban Projects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fix Login Bug', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Kanban Projects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fix Login Bug', exact: true })).toBeVisible();
  const persisted = await request.get('http://127.0.0.1:5000/workspace', {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const workspace = await persisted.json();
  expect(workspace.tasks).toHaveLength(1);
  expect(
    workspace.activity.some((a: { action: string }) => a.action === 'ai.proposal.approved'),
  ).toBeTruthy();
  const targetLane = page.locator('.kanban-lane').nth(1);
  const handle = page.getByRole('button', { name: 'Drag Fix Login Bug', exact: true });
  const from = await handle.boundingBox();
  const to = await targetLane.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 120, { steps: 20 });
  await page.mouse.up();
  await expect(
    targetLane.getByRole('button', { name: 'Fix Login Bug', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Kanban Projects', exact: true }).click();
  await expect(
    page.locator('.kanban-lane').nth(1).getByRole('button', { name: 'Fix Login Bug', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'AI Agents', exact: true }).click();
  await page.getByRole('button', { name: 'Run agent', exact: true }).first().click();
  await expect(page.getByText('completed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View report' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Lightweight algorithms');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Automations', exact: true }).click();
  await page.getByRole('button', { name: 'New automation' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve & enable' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run due rules' }).click();
  await expect(page.getByText('Last execution: completed')).toBeVisible();
  await page.getByRole('button', { name: 'Command Center', exact: true }).click();
  await page.getByLabel('samm@workspace ~ $').fill('health');
  await page.getByRole('button', { name: 'Execute command' }).click();
  await expect(page.locator('pre')).toContainText('"database": "ok"');
  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Service health' })).toBeVisible();
  await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  expect(failures).toEqual([]);
});

test('voice controls expose real capability errors and typed fallback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  const email = `voice-${Date.now()}@example.test`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Voice Tester');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Voice-test-pass123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Voice/ })).toBeVisible();
  await page.getByRole('button', { name: 'Voice Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByRole('alert')).toContainText('Speech recognition is unavailable');
  await expect(page.getByLabel('Ask Samm')).toBeEditable();
});

// Only the permission/device boundary is mocked; the workspace uses the real API.
test('cancelling a pending microphone permission releases the late stream', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sammtech-preferences',
      JSON.stringify({
        state: { localVoice: true, lowPerformance: true, voice: false, reducedMotion: true },
        version: 0,
      }),
    );
    const testWindow = window as typeof window & {
      releaseTestPermission?: () => void;
      stoppedTracks?: number;
    };
    testWindow.stoppedTracks = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () =>
        new Promise((resolve) => {
          testWindow.releaseTestPermission = () =>
            resolve({
              getTracks: () => [
                {
                  stop: () => {
                    testWindow.stoppedTracks!++;
                  },
                },
              ],
            });
        }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Cancellation Tester');
  await page.getByLabel('Email address').fill(`cancel-${Date.now()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('Cancellation-pass123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Cancellation/ })).toBeVisible();
  await page.getByRole('button', { name: 'Voice Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Start microphone' }).click();
  await expect(page.getByRole('button', { name: 'Stop microphone' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel request' }).click();
  await page.evaluate(() => (window as any).releaseTestPermission());
  await expect.poll(() => page.evaluate(() => (window as any).stoppedTracks)).toBe(1);
  await expect(page.getByRole('button', { name: 'Start microphone' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
