import type { Page, APIRequestContext } from '@playwright/test';
import { test, expect } from './support/test';
const apiOrigin = process.env.E2E_API_URL || 'http://127.0.0.1:5000';
async function signIn(page: Page, request: APIRequestContext, prefix: string) {
  const email = `${prefix}-${Date.now()}@example.test`;
  const password = 'Samm-voice-test-pass123';
  const created = await request.post(`${apiOrigin}/auth/register`, {
    data: { name: 'Samm Voice Tester', email, password },
  });
  expect(created.status()).toBe(201);
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Enter workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hey Samm/ })).toBeVisible();
  const session = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('sammtech-session') || '{}'),
  );
  return { token: session.token, email };
}
function preferences(localVoice = false) {
  return {
    state: { theme: 'dark', lowPerformance: true, reducedMotion: true, voice: false, localVoice },
    version: 0,
  };
}

// Device APIs are mocked only at the browser boundary. These tests do not claim audible hardware playback.
test('Samm greets only after interaction and exposes real playback stop state', async ({
  page,
  request,
}) => {
  await page.addInitScript((prefs) => {
    localStorage.setItem('sammtech-preferences', JSON.stringify(prefs));
    const state = window as any;
    state.sammSpoken = [];
    state.sammCurrentUtterance = null;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance: SpeechSynthesisUtterance) {
          state.sammSpoken.push(utterance.text);
          state.sammCurrentUtterance = utterance;
          utterance.onstart?.(new Event('start') as any);
        },
        cancel() {
          state.sammCurrentUtterance?.onend?.(new Event('end'));
          state.sammCurrentUtterance = null;
        },
      },
    });
  }, preferences());
  await signIn(page, request, 'samm-greeting');
  await page.getByRole('button', { name: 'Voice Workspace', exact: true }).click();
  expect(await page.evaluate(() => (window as any).sammSpoken)).toEqual([]);
  await page.getByRole('button', { name: 'Say hello', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).sammSpoken))
    .toEqual(["Hello! I'm Samm, your AI workspace assistant. How can I help you today?"]);
  await expect(page.getByText('Samm is speaking', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Stop speaking', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop speaking', exact: true })).toBeDisabled();
  await expect(page.getByText('Samm is idle', { exact: true })).toBeVisible();
});

test('recognized approval cannot save; reviewed task updates and moves persist through real APIs', async ({
  page,
  request,
}) => {
  await page.addInitScript((prefs) => {
    localStorage.setItem('sammtech-preferences', JSON.stringify(prefs));
    const state = window as any;
    class Recognition {
      onresult: ((event: any) => void) | undefined;
      onend: (() => void) | undefined;
      start() {
        state.sammRecognition = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
    state.sammRecognize = (text: string) => {
      const recognition = state.sammRecognition;
      recognition.onresult?.({ results: [[{ transcript: text }]] });
      recognition.onend?.();
    };
  }, preferences());
  const account = await signIn(page, request, 'samm-approval');
  const headers = { Authorization: `Bearer ${account.token}` };
  const response = await request.post(`${apiOrigin}/boards`, {
    headers,
    data: { title: 'Voice reviewed project' },
  });
  expect(response.status()).toBe(201);
  const board = await response.json();
  const taskResponse = await request.post(`${apiOrigin}/columns/${board.columns[0].id}/tasks`, {
    headers,
    data: { title: 'Reviewed voice task', priority: 'MEDIUM' },
  });
  expect(taskResponse.status()).toBe(201);
  const task = await taskResponse.json();
  await page.reload();
  await page.getByRole('button', { name: 'Voice Workspace', exact: true }).click();
  const recognize = async (text: string) => {
    await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
    await page.evaluate((text) => (window as any).sammRecognize(text), text);
  };
  await recognize('Set priority of "Reviewed voice task" to high');
  await expect(page.getByRole('button', { name: 'Approve update', exact: true })).toBeVisible();
  await recognize('Yes');
  await expect(page.getByRole('status')).toContainText('does not authorize a workspace change');
  const before = await request.get(`${apiOrigin}/workspace`, { headers });
  expect((await before.json()).tasks.find((t: any) => t.id === task.id).priority).toBe('MEDIUM');
  await page.getByRole('button', { name: 'Approve update', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('has been saved');
  const target = board.columns.find((c: any) => c.title === 'In Progress') || board.columns[1];
  await page.getByLabel('Ask Samm').fill(`Move "Reviewed voice task" to "${target.title}"`);
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve move', exact: true })).toBeVisible();
  const beforeMove = await request.get(`${apiOrigin}/workspace`, { headers });
  expect((await beforeMove.json()).tasks.find((t: any) => t.id === task.id).columnId).toBe(
    board.columns[0].id,
  );
  await page.getByRole('button', { name: 'Approve move', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('has been moved');
  await page.reload();
  await page.getByRole('button', { name: 'Voice Workspace', exact: true }).click();
  const persisted = await request.get(`${apiOrigin}/workspace`, { headers });
  const saved = (await persisted.json()).tasks.find((t: any) => t.id === task.id);
  expect(saved.priority).toBe('HIGH');
  expect(saved.columnId).toBe(target.id);
  await page.getByText(/Conversation history \(/).click();
  await expect(page.getByRole('list', { name: 'Conversation transcript' })).toContainText(
    'Reviewed voice task',
  );
  await page.getByRole('button', { name: 'Clear conversation', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Conversation transcript' }).locator('li'),
  ).toHaveCount(0);
});

test('a denied microphone permission is actionable and keeps typed fallback available', async ({
  page,
  request,
}) => {
  await page.addInitScript((prefs) => {
    localStorage.setItem('sammtech-preferences', JSON.stringify(prefs));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    });
  }, preferences(true));
  await signIn(page, request, 'samm-denied');
  await page.getByRole('button', { name: 'Voice Workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Start microphone', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone permission was denied');
  await expect(page.getByRole('button', { name: 'Start microphone', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ask Samm')).toBeEditable();
});
