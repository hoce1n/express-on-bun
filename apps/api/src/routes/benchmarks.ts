import { Router } from 'express';

/**
 * Benchmark endpoints — BUSINESS LOGIC, intentionally not implemented yet.
 *
 * Intended contract (mounted at /api/v1/benchmarks):
 *
 *   POST /api/v1/benchmarks/json-parse
 *     Payload:  { payloadBytes, iterations, seed? }
 *     Runs a synthetic multi-MB JSON.stringify/parse round-trip, measures
 *     wall-clock time with Bun.nanoseconds(), returns a BenchmarkResult.
 *
 *   POST /api/v1/benchmarks/regex-match
 *     Payload:  { payloadBytes, iterations, seed?, pattern? }
 *     Builds a large text buffer and runs a complex regex match over it,
 *     returns a BenchmarkResult.
 *
 *   GET  /api/v1/benchmarks/system-info
 *     Returns a RuntimeSnapshot (cpu count, platform, versions) so results
 *     can be normalized across machines.
 *
 * Handlers must:
 *   - validate input with zod against @bench/shared types,
 *   - enforce MAX_BODY_MB via the JSON body parser in app.ts,
 *   - sample process.memoryUsage() before/after execution,
 *   - catch errors and convert them to HttpError / ValidationError,
 *   - never allow a rejected promise to reach the global handler untyped.
 */
export const benchmarksRouter: Router = Router();
