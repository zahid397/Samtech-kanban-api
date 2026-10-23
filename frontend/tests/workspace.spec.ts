import { test, expect } from './support/test';

test('project overview, calendar, notifications and subscription use saved account data', async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'sammtech-preferences',
      JSON.stringify({
        state: { lowPerformance: true, reducedMotion: true, theme: 'dark', voice: false },
        version: 0,
      }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Workspace Tester');
  await page.getByLabel('Email address').fill(`workspace-${Date.now()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('Workspace-tests123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Workspace/ })).toBeVisible();
  const session = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('sammtech-session') || '{}'),
  );
  const headers = { Authorization: `Bearer ${session.token}` };
  const origin = process.env.E2E_API_URL || 'http://127.0.0.1:5000';
  const boardResponse = await request.post(`${origin}/boards`, {
    headers,
    data: { title: 'Saved project' },
  });
  expect(boardResponse.status()).toBe(201);
  const board = await boardResponse.json();
  const due = new Date(Date.now() + 24 * 3600000).toISOString();
  const taskResponse = await request.post(`${origin}/columns/${board.columns[0].id}/tasks`, {
    headers,
    data: { title: 'Review the release', dueDate: due, priority: 'HIGH' },
  });
  expect(taskResponse.status()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved project', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Project title').fill('Verified project');
  await page.getByRole('button', { name: 'Save project name', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verified project', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: `${due.slice(0, 10)}, 1 deadlines`, exact: true }).click();
  await expect(page.locator('.calendar-agenda')).toContainText('Review the release');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.locator('.notification-list')).toContainText('Review the release');
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click();
  await page.getByLabel('Show unread only').check();
  await expect(page.getByRole('heading', { name: "You're all caught up" })).toBeVisible();
  await page.getByRole('button', { name: 'Team Workspace', exact: true }).click();
  await expect(page.locator('.team-member')).toContainText(session.user.email);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'workspace-brief.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('A real saved workspace note.'),
    });
  await expect(page.getByText('workspace-brief.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Subscription', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'STARTER · preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Record plan interest', exact: true }).first().click();
  await page.getByLabel('I want to record my plan interest.').check();
  await page.getByRole('button', { name: 'Confirm plan interest', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your plan interest was recorded');
  const subscription = await request.get(`${origin}/workspace/subscription`, { headers });
  const data = await subscription.json();
  expect(data.plan).toBe('STARTER');
  expect(data.billingConfigured).toBe(false);
  expect(data.usage.boards).toBe(1);
  expect(data.usage.tasks).toBe(1);
  expect(data.usage.files).toBe(1);
  const workspace = await (await request.get(`${origin}/workspace`, { headers })).json();
  expect(
    workspace.activity.some(
      (a: { action: string }) => a.action === 'subscription.interest.recorded',
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 660 });
  await page.screenshot({ path: 'test-results/subscription-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('custom columns, sorting, assignment and archived restoration persist', async ({
  page,
  request,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'sammtech-preferences',
      JSON.stringify({
        state: { lowPerformance: true, reducedMotion: true, voice: false },
        version: 0,
      }),
    ),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Kanban Tester');
  await page.getByLabel('Email address').fill(`kanban-extra-${Date.now()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('Kanban-tests-pass123');
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Kanban/ })).toBeVisible();
  const session = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('sammtech-session') || '{}'),
  );
  const headers = { Authorization: `Bearer ${session.token}` };
  const origin = process.env.E2E_API_URL || 'http://127.0.0.1:5000';
  const board = await (
    await request.post(`${origin}/boards`, { headers, data: { title: 'Column coverage' } })
  ).json();
  for (const [title, priority] of [
    ['Low item', 'LOW'],
    ['High item', 'HIGH'],
  ])
    expect(
      (
        await request.post(`${origin}/columns/${board.columns[0].id}/tasks`, {
          headers,
          data: { title, priority },
        })
      ).status(),
    ).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: 'Kanban Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Manage columns', exact: true }).click();
  await page.getByLabel('New column name').fill('Waiting');
  await page.getByRole('button', { name: 'Add column', exact: true }).click();
  await expect(page.getByLabel('Column name 6')).toHaveValue('Waiting');
  await page.getByLabel('Column name 6').fill('Blocked');
  await page.getByRole('button', { name: 'Save column', exact: true }).last().click();
  await expect(
    page.getByRole('combobox', { name: 'Position of Blocked', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('heading', { name: 'Blocked', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Task sorting', exact: true }).selectOption('priority');
  await expect(page.locator('.kanban-lane').first().locator('.task-title').first()).toHaveText(
    'High item',
  );
  await page.getByRole('button', { name: 'Low item', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Task assignment', exact: true })
    .selectOption(session.user.id);
  await page.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let workspace = await (await request.get(`${origin}/workspace`, { headers })).json();
  expect(workspace.tasks.find((t: any) => t.title === 'Low item').assigneeId).toBe(session.user.id);
  await page.getByRole('button', { name: 'Low item', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Archive task', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Low item', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived tasks', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Low item');
  await page.getByRole('button', { name: 'Restore task', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No archived tasks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Kanban Projects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Low item', exact: true })).toBeVisible();
  workspace = await (await request.get(`${origin}/workspace`, { headers })).json();
  expect(workspace.tasks).toHaveLength(2);
  expect(workspace.activity.some((a: any) => a.action === 'task.restored')).toBe(true);
});
