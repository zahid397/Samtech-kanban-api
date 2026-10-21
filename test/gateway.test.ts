import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { WorkspaceService } from '../src/workspace/workspace.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

const gateway = new WorkspaceService({} as PrismaService, {} as TasksService);
const originalFetch = globalThis.fetch;
const originalUrl = process.env.AI_ENGINE_URL;
const originalKey = process.env.AI_SERVICE_KEY;
before(() => {
  process.env.AI_ENGINE_URL = 'http://127.0.0.1:8000';
  process.env.AI_SERVICE_KEY = 'test-only-ai-service-key-with-32-characters';
});
after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.AI_ENGINE_URL;
  else process.env.AI_ENGINE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.AI_SERVICE_KEY;
  else process.env.AI_SERVICE_KEY = originalKey;
});

test('gateway cancels a streamed response before consuming an oversized body', async () => {
  let cancelled = false;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(1_100_000));
      if (pulls === 20) controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  globalThis.fetch = async () => new Response(stream);
  await assert.rejects(gateway.gateway('/analyze', {}), ServiceUnavailableException);
  assert.equal(cancelled, true);
  assert.ok(pulls < 20, 'must stop rather than buffer the entire response');
});

test('gateway rejects an excessive advertised size without reading it', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  globalThis.fetch = async () => new Response(stream, { headers: { 'content-length': '2000001' } });
  await assert.rejects(gateway.gateway('/voice/transcribe', {}), ServiceUnavailableException);
  assert.equal(cancelled, true);
});

test('Piper speech responses have a larger but bounded allowance', async () => {
  const responseBody = JSON.stringify({ audio: 'a'.repeat(2_100_000), mimeType: 'audio/wav' });
  globalThis.fetch = async () => new Response(responseBody);
  const speech = await gateway.gateway('/voice/speak', { text: 'Hello' });
  assert.equal(speech.audio.length, 2_100_000);
  globalThis.fetch = async () => new Response(responseBody);
  await assert.rejects(gateway.gateway('/analyze', {}), ServiceUnavailableException);

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(6_100_000));
    },
    cancel() {
      cancelled = true;
    },
  });
  globalThis.fetch = async () => new Response(stream);
  await assert.rejects(
    gateway.gateway('/voice/speak', { text: 'Hello' }),
    ServiceUnavailableException,
  );
  assert.equal(cancelled, true);
});
