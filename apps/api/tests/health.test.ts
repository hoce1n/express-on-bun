import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { env } from '../src/config/env';

const MAX_BODY_MB = env.MAX_BODY_MB;

/**
 * Smoke test: boots the real app on an ephemeral port and verifies the
 * health endpoint and the JSON error envelope for unknown routes.
 */
describe('api smoke test', () => {
  const app = createApp();
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (typeof address === 'object' && address !== null) {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('unable to determine test server address');
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('GET /health returns 200 ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
    expect(res.headers.get('x-bench-duration-ns')).not.toBeNull();
  });

  test('unknown route returns structured 404', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe('Not found');
  });

  test('malformed JSON body returns 400 without crashing', async () => {
    const res = await fetch(`${baseUrl}/api/v1/benchmarks/json-parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  test('oversized JSON body returns 413, not 500', async () => {
    const bigPayload = JSON.stringify({ x: 'a'.repeat(MAX_BODY_MB * 1024 * 1024) });
    const res = await fetch(`${baseUrl}/api/v1/benchmarks/json-parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bigPayload,
    });
    expect(res.status).toBe(413);
  });
});
