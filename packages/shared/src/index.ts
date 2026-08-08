/**
 * Shared, runtime-independent contracts between the backend API
 * (apps/api) and the web dashboard (apps/dashboard).
 *
 * Types are consumed directly from this workspace source file by both
 * `bun build` (API) and Vite (dashboard), so no build step is required here.
 */

/** Supported benchmark workloads. */
export type BenchmarkType = 'json_parse' | 'regex_match';

/** Request contract for the json_parse benchmark. */
export interface JsonParseRequest {
  type: 'json_parse';
  /**
   * The JSON document to parse:
   *  - a string containing stringified JSON ("raw string"), or
   *  - any JSON value (already-parsed JSON body). The value is serialized
   *    once (untimed setup), then JSON.parse is measured over it.
   */
  payload: string | unknown;
  /** Number of times to parse the document. Defaults to 1. */
  iterations?: number;
  /** Reserved for deterministic synthetic payload generation. */
  seed?: number;
}

/** Request contract for the regex_match benchmark. */
export interface RegexMatchRequest {
  type: 'regex_match';
  /** Source text buffer to match against. */
  text: string;
  /** Regex source without delimiters, e.g. "\\d{4}-\\d{2}-\\d{2}". */
  pattern: string;
  /** RegExp flags, e.g. "g" or "gi". */
  flags?: string;
  /** Number of times to run the match pass. Defaults to 1. */
  iterations?: number;
}

/** Discriminated union of all benchmark request contracts. */
export type BenchmarkRequest = JsonParseRequest | RegexMatchRequest;

/** Runtime engine information embedded in every result. */
export interface EngineInfo {
  /** Bun runtime version, e.g. "1.3.14". */
  bun: string;
  /** Node.js compatibility version reported by the runtime. */
  node: string;
}

/** process.memoryUsage() projection, in bytes. */
export interface MemorySample {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

/** Before / after / delta memory snapshot around a benchmark run. */
export interface BenchmarkMemory {
  before: MemorySample;
  after: MemorySample;
  delta: MemorySample;
}

/** Normalized result payload returned by every benchmark endpoint. */
export interface BenchmarkResult {
  type: BenchmarkType;
  success: boolean;
  /** ISO-8601 timestamp taken immediately before execution. */
  startedAtIso: string;
  /** Number of timed iterations executed. */
  iterations: number;
  /** Total bytes of input processed across all iterations (UTF-8). */
  bytesProcessed: number;
  /** Count of parsed JSON values / regex matches across all iterations. */
  itemsProcessed: number;
  /** Wall-clock execution time of the timed section, in nanoseconds. */
  executionTimeNs: number;
  /** Convenience duration in milliseconds (executionTimeNs / 1e6). */
  executionTimeMs: number;
  /** Throughput: bytesProcessed / 1e6 / seconds. */
  throughputMBps: number;
  /** Whether a full GC was forced before the run (Bun.gc(true)). */
  gcForced: boolean;
  memory: BenchmarkMemory;
  engine: EngineInfo;
}

/** System/runtime context for normalizing results across machines. */
export interface SystemInfo {
  engine: EngineInfo;
  /** Host platform, e.g. "linux". */
  platform: string;
  /** Host architecture, e.g. "x64". */
  arch: string;
  /** Logical CPU core count. */
  cpuCount: number;
  /** ISO-8601 timestamp. */
  timestamp: string;
}

/** Envelope for successful API responses. */
export interface ApiSuccessResponse<T> {
  data: T;
  meta: {
    /** Total handler wall-clock time in nanoseconds. */
    durationNs: number;
    durationMs: number;
    timestamp: string;
  };
}

/** Stable machine-readable error codes returned in the error envelope. */
export type ApiErrorCode =
  | 'INVALID_PAYLOAD'
  | 'MALFORMED_JSON'
  | 'INVALID_REGEX'
  | 'REGEX_TIMEOUT'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

/** Envelope for API error responses (produced by the global error handler). */
export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    /** Only present when NODE_ENV !== "production". */
    stack?: string;
  };
}
