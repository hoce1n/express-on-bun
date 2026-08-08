import type {
  ApiSuccessResponse,
  BenchmarkResult,
  EngineInfo,
  SystemInfo,
} from '@bench/shared';
import { Router, type Request, type Response } from 'express';
import { cpus } from 'node:os';
import { z } from 'zod';
import { env } from '../config/env';
import { getMemoryStats, memoryDelta } from '../lib/memory';
import { runRegexBenchmark } from '../lib/regex-worker-runner';
import {
  elapsedNs,
  nowNs,
  nsToMs,
  throughputMBps,
  tryForceGc,
} from '../lib/timing';
import { HttpError, ValidationError } from '../middleware/error-handler';

/**
 * Benchmark endpoints — the core benchmarking engine.
 *
 *   POST /api/v1/benchmarks/json-parse   parse multi-MB JSON, measure ns
 *   POST /api/v1/benchmarks/regex-match  regex over large text (worker+timeout)
 *   GET  /api/v1/benchmarks/system-info  runtime context for normalization
 *
 * Every response is an ApiSuccessResponse<BenchmarkResult> envelope; every
 * failure is a structured { error } envelope with a stable `code` (see
 * middleware/error-handler.ts). The `x-bench-duration-ns` response header
 * is attached by the metrics middleware for transparent HTTP tracing.
 */

export const benchmarksRouter: Router = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function wrap<T>(data: T, durationNs: number): ApiSuccessResponse<T> {
  return {
    data,
    meta: {
      durationNs,
      durationMs: nsToMs(durationNs),
      timestamp: new Date().toISOString(),
    },
  };
}

function engineInfo(): EngineInfo {
  return { bun: Bun.version, node: process.versions.node };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** UTF-8 byte length of a string. */
function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** Recursively count every value contained in a JSON structure. */
function countJsonValues(value: unknown): number {
  if (value === null || typeof value !== 'object') return 1;
  let count = 1;
  if (Array.isArray(value)) {
    for (const item of value) count += countJsonValues(item);
  } else {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      count += countJsonValues((value as Record<string, unknown>)[key]);
    }
  }
  return count;
}

const iterationsSchema = z
  .number()
  .int()
  .min(1)
  .max(env.BENCH_MAX_ITERATIONS)
  .default(1);

/** Route adapter: sends the handler's result; Express 5 forwards rejections. */
const respond =
  (handler: (req: Request) => Promise<unknown> | unknown) =>
  async (req: Request, res: Response): Promise<void> => {
    res.json(await handler(req));
  };

// ---------------------------------------------------------------------------
// json_parse
// ---------------------------------------------------------------------------

const jsonParseEnvelopeSchema = z.object({
  type: z.literal('json_parse').optional(),
  payload: z.unknown(),
  iterations: iterationsSchema,
  seed: z.number().int().optional(),
});

/**
 * An envelope is any non-null, non-array object that owns a `payload` key.
 * Everything else is treated as the raw JSON document body itself.
 */
function isEnvelope(body: unknown): body is Record<string, unknown> {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'payload' in body
  );
}

async function handleJsonParse(
  req: Request,
): Promise<ApiSuccessResponse<BenchmarkResult>> {
  const startedAt = nowNs();

  const body = req.body as unknown;
  let document: unknown;
  let iterations = 1;

  if (isEnvelope(body)) {
    const parsed = jsonParseEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('invalid json_parse request', parsed.error.flatten());
    }
    document = parsed.data.payload;
    iterations = parsed.data.iterations;
  } else {
    document = body;
  }

  // Normalize the document to a string so every timed pass is a pure
  // JSON.parse. A string payload is used directly; an already-parsed JSON
  // value (the "raw JSON body" case) is serialized once (untimed setup).
  let source: string;
  if (typeof document === 'string') {
    source = document;
  } else {
    const serialized = JSON.stringify(document);
    if (typeof serialized !== 'string') {
      throw new ValidationError('payload is not JSON-serializable');
    }
    source = serialized;
  }

  if (source.length === 0) {
    throw new ValidationError('payload is empty');
  }

  // Count the parsed items on an untimed pass so the measured loop stays pure.
  let parsedDocument: unknown;
  try {
    parsedDocument = JSON.parse(source);
  } catch (err) {
    throw new HttpError(400, 'malformed JSON payload', 'MALFORMED_JSON', {
      message: messageOf(err),
    });
  }
  const itemsPerPass = countJsonValues(parsedDocument);
  const bytesPerPass = utf8ByteLength(source);

  // Timed section: GC for a clean heap baseline, then parse N times.
  const gcForced = tryForceGc();
  const before = getMemoryStats();
  const startedAtIso = new Date().toISOString();
  const runStartedAt = nowNs();

  let success = true;
  for (let i = 0; i < iterations; i++) {
    try {
      JSON.parse(source);
    } catch {
      success = false;
      break;
    }
  }
  const executionTimeNs = elapsedNs(runStartedAt);
  const after = getMemoryStats();

  const bytesProcessed = bytesPerPass * iterations;
  const result: BenchmarkResult = {
    type: 'json_parse',
    success,
    startedAtIso,
    iterations,
    bytesProcessed,
    itemsProcessed: itemsPerPass * iterations,
    executionTimeNs,
    executionTimeMs: nsToMs(executionTimeNs),
    throughputMBps: throughputMBps(bytesProcessed, executionTimeNs),
    gcForced,
    memory: { before, after, delta: memoryDelta(before, after) },
    engine: engineInfo(),
  };

  return wrap(result, elapsedNs(startedAt));
}

// ---------------------------------------------------------------------------
// regex_match
// ---------------------------------------------------------------------------

const regexMatchSchema = z.object({
  type: z.literal('regex_match').optional(),
  text: z.string().min(1).max(env.BENCH_MAX_TEXT_CHARS),
  pattern: z.string().min(1).max(1024),
  flags: z.string().max(16).default(''),
  iterations: iterationsSchema,
});

async function handleRegexMatch(
  req: Request,
): Promise<ApiSuccessResponse<BenchmarkResult>> {
  const startedAt = nowNs();

  const parsed = regexMatchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('invalid regex_match request', parsed.error.flatten());
  }
  const { text, pattern, flags, iterations } = parsed.data;

  // Validate the pattern compiles before spending a worker round-trip.
  try {
    new RegExp(pattern, flags);
  } catch (err) {
    throw new HttpError(400, 'invalid regex pattern', 'INVALID_REGEX', {
      message: messageOf(err),
    });
  }

  const gcForced = tryForceGc();
  const startedAtIso = new Date().toISOString();
  const bytesPerPass = utf8ByteLength(text);

  // Execution runs in a worker so a catastrophic pattern is hard-terminated
  // by REGEX_TIMEOUT_MS instead of freezing the server.
  const workerResult = await runRegexBenchmark(
    { text, pattern, flags, iterations },
    env.REGEX_TIMEOUT_MS,
  );

  const bytesProcessed = bytesPerPass * iterations;
  const result: BenchmarkResult = {
    type: 'regex_match',
    success: true,
    startedAtIso,
    iterations,
    bytesProcessed,
    itemsProcessed: workerResult.itemsProcessed,
    executionTimeNs: workerResult.durationNs,
    executionTimeMs: nsToMs(workerResult.durationNs),
    throughputMBps: throughputMBps(bytesProcessed, workerResult.durationNs),
    gcForced,
    memory: workerResult.memory,
    engine: engineInfo(),
  };

  return wrap(result, elapsedNs(startedAt));
}

// ---------------------------------------------------------------------------
// system-info
// ---------------------------------------------------------------------------

async function handleSystemInfo(): Promise<ApiSuccessResponse<SystemInfo>> {
  const startedAt = nowNs();
  const info: SystemInfo = {
    engine: engineInfo(),
    platform: process.platform,
    arch: process.arch,
    cpuCount: cpus().length,
    timestamp: new Date().toISOString(),
  };
  return wrap(info, elapsedNs(startedAt));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

benchmarksRouter.post('/json-parse', respond(handleJsonParse));
benchmarksRouter.post('/regex-match', respond(handleRegexMatch));
benchmarksRouter.get('/system-info', respond(handleSystemInfo));
