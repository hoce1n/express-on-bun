import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { BenchmarkResult } from '@bench/shared';
import { startTestServer, type TestServer } from './helpers/test-server';

const JSON_PARSE_URL = '/api/v1/benchmarks/json-parse';
const REGEX_MATCH_URL = '/api/v1/benchmarks/regex-match';

async function postJson(baseUrl: string, url: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('benchmark endpoints', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /json-parse', () => {
    test('parses a large payload and reports throughput', async () => {
      const records = Array.from({ length: 20_000 }, (_, i) => ({
        id: i,
        name: `record-${i}`,
        active: i % 2 === 0,
      }));
      const body = {
        type: 'json_parse',
        payload: JSON.stringify({ generatedAt: '2026-08-08T00:00:00.000Z', records }),
        iterations: 50,
      };

      const res = await postJson(server.baseUrl, JSON_PARSE_URL, body);
      expect(res.status).toBe(200);

      const envelope = (await res.json()) as { data: BenchmarkResult };
      const result = envelope.data;

      expect(result.type).toBe('json_parse');
      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBeGreaterThan(0);
      expect(result.bytesProcessed).toBeGreaterThan(0);
      expect(result.executionTimeNs).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.throughputMBps).toBeGreaterThan(0);
      expect(Number.isFinite(result.throughputMBps)).toBe(true);
      expect(result.engine.bun).toBe(Bun.version);
      expect(result.memory.before).toBeDefined();
      expect(result.memory.after).toBeDefined();
      expect(result.memory.delta).toBeDefined();
      // Transparent HTTP tracing header.
      expect(res.headers.get('x-bench-duration-ns')).not.toBeNull();
    });

    test('accepts a raw JSON body without an envelope', async () => {
      const document = { label: 'hello', items: [1, 2, 3], nested: { a: true, b: null } };
      const res = await postJson(server.baseUrl, JSON_PARSE_URL, document);

      expect(res.status).toBe(200);
      const result = ((await res.json()) as { data: BenchmarkResult }).data;
      expect(result.type).toBe('json_parse');
      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBeGreaterThan(0);
      expect(result.iterations).toBe(1);
    });

    test('accepts a stringified JSON payload string', async () => {
      const res = await postJson(server.baseUrl, JSON_PARSE_URL, {
        payload: '{"a":1,"b":[true,false,null]}',
        iterations: 10,
      });

      expect(res.status).toBe(200);
      const result = ((await res.json()) as { data: BenchmarkResult }).data;
      expect(result.success).toBe(true);
      // {"a":1,"b":[true,false,null]} = 6 values (root, a, b-array, true, false, null)
      expect(result.itemsProcessed).toBe(10 * 6);
    });

    test('malformed JSON payload returns 400 with MALFORMED_JSON', async () => {
      const res = await postJson(server.baseUrl, JSON_PARSE_URL, {
        payload: '{ this is not json',
        iterations: 1,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe('MALFORMED_JSON');
      expect(body.error.message).toContain('malformed');
    });

    test('iterations outside bounds returns 400 with INVALID_PAYLOAD', async () => {
      const res = await postJson(server.baseUrl, JSON_PARSE_URL, {
        payload: '{"a":1}',
        iterations: 10_000_000,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_PAYLOAD');
    });
  });

  describe('POST /regex-match', () => {
    test('global matching over a large text buffer', async () => {
      const text = 'banana '.repeat(100_000); // ~700 KB
      const iterations = 5;
      const res = await postJson(server.baseUrl, REGEX_MATCH_URL, {
        type: 'regex_match',
        text,
        pattern: 'banana',
        flags: 'g',
        iterations,
      });

      expect(res.status).toBe(200);
      const result = ((await res.json()) as { data: BenchmarkResult }).data;

      expect(result.type).toBe('regex_match');
      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(100_000 * iterations);
      expect(result.bytesProcessed).toBeGreaterThan(0);
      expect(result.executionTimeNs).toBeGreaterThan(0);
      expect(result.throughputMBps).toBeGreaterThan(0);
      expect(Number.isFinite(result.throughputMBps)).toBe(true);
      expect(result.engine.bun).toBe(Bun.version);
      expect(res.headers.get('x-bench-duration-ns')).not.toBeNull();
    });

    test('non-global pattern short-circuits at the first match', async () => {
      const res = await postJson(server.baseUrl, REGEX_MATCH_URL, {
        text: 'a'.repeat(10_000) + 'needle' + 'b'.repeat(10_000),
        pattern: 'needle',
        flags: '',
        iterations: 3,
      });

      expect(res.status).toBe(200);
      const result = ((await res.json()) as { data: BenchmarkResult }).data;
      expect(result.success).toBe(true);
      expect(result.itemsProcessed).toBe(3);
    });

    test('invalid regex pattern returns 400 with INVALID_REGEX', async () => {
      const res = await postJson(server.baseUrl, REGEX_MATCH_URL, {
        text: 'some text',
        pattern: '(unclosed',
        flags: '',
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_REGEX');
    });

    test('missing text returns 400 with INVALID_PAYLOAD', async () => {
      const res = await postJson(server.baseUrl, REGEX_MATCH_URL, {
        pattern: 'x',
        flags: '',
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_PAYLOAD');
    });
  });

  describe('GET /system-info', () => {
    test('returns runtime context', async () => {
      const res = await fetch(`${server.baseUrl}/api/v1/benchmarks/system-info`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { engine: { bun: string }; cpuCount: number };
      };
      expect(body.data.engine.bun).toBe(Bun.version);
      expect(body.data.cpuCount).toBeGreaterThan(0);
    });
  });
});
