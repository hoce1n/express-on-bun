import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { env } from '../src/config/env';
import { startTestServer, type TestServer } from './helpers/test-server';

/**
 * Smoke test: boots the real app on an ephemeral port and verifies the
 * health endpoint and the JSON error envelopes for bad input.
 */
describe('api smoke test', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  test('GET /health returns 200 ok', async () => {
    const res = await fetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
    expect(res.headers.get('x-bench-duration-ns')).not.toBeNull();
  });

  test('unknown route returns structured 404', async () => {
    const res = await fetch(`${server.baseUrl}/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string; code: string } };
    expect(body.error.message).toBe('Not found');
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('malformed JSON body returns 400 without crashing', async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/benchmarks/json-parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  test('oversized JSON body returns 413, not 500', async () => {
    const bigPayload = JSON.stringify({ x: 'a'.repeat(env.MAX_BODY_MB * 1024 * 1024) });
    const res = await fetch(`${server.baseUrl}/api/v1/benchmarks/json-parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bigPayload,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
