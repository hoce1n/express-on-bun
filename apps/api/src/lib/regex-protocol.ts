import type { BenchmarkMemory } from '@bench/shared';

/**
 * Message protocol shared by the regex-match benchmark runner (main thread)
 * and the dedicated worker that actually executes the regex.
 *
 * The worker runs the regex off the main thread so a pathological
 * (catastrophic backtracking) pattern can be hard-terminated by the runner
 * without blocking or crashing the server.
 */

/** Cap on matches counted per pass to bound worst-case work. */
export const MAX_MATCHES_PER_PASS = 1_000_000;

/** Job payload posted to the worker. */
export interface RegexBenchJob {
  text: string;
  pattern: string;
  flags: string;
  iterations: number;
}

/** Successful worker response. Timing and memory are measured in the worker. */
export interface RegexBenchOkResult {
  ok: true;
  /** Total matches across all iterations. */
  itemsProcessed: number;
  /** Wall-clock time of the timed section, in nanoseconds. */
  durationNs: number;
  memory: BenchmarkMemory;
}

/** Failed worker response (e.g. regex compile error in the worker). */
export interface RegexBenchErrorResult {
  ok: false;
  message: string;
}

export type RegexBenchWorkerResponse = RegexBenchOkResult | RegexBenchErrorResult;
