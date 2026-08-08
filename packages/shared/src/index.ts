/**
 * Shared, runtime-independent contracts between the backend API
 * (apps/api) and the web dashboard (apps/dashboard).
 *
 * Types are consumed directly from this workspace source file by both
 * `bun build` (API) and Vite (dashboard), so no build step is required here.
 */

/** Request envelope accepted by the stress-test benchmark endpoints. */
export interface BenchmarkRequest {
  /** Approximate size in bytes of the synthetic workload (payload/buffer). */
  payloadBytes: number;
  /** Number of times to repeat the workload so timing is statistically stable. */
  iterations: number;
  /** Optional seed for deterministic pseudo-random workload generation. */
  seed?: number;
}

/** System/runtime snapshot captured alongside a benchmark execution. */
export interface RuntimeSnapshot {
  /** Bun version string, e.g. "1.2.17". */
  bun: string;
  /** Node.js compatibility version reported by Bun. */
  node: string;
  /** CPU core count observed by the runtime. */
  cpuCount: number;
  /** Host platform string, e.g. "linux". */
  platform: string;
  /** Host architecture, e.g. "x64". */
  arch: string;
}

/** process.memoryUsage() projection reported in bytes. */
export interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

/**
 * Normalized result payload returned by every benchmark endpoint.
 * `durationNs` is measured with `Bun.nanoseconds()` for wall-clock precision.
 */
export interface BenchmarkResult {
  /** Benchmark identifier, e.g. "json-parse". */
  name: string;
  /** ISO-8601 timestamp taken immediately before execution. */
  startedAtIso: string;
  /** Total wall-clock time of the workload in nanoseconds. */
  durationNs: number;
  /** Convenience duration in milliseconds (durationNs / 1e6). */
  durationMs: number;
  /** Throughput: iterations / seconds. */
  operationsPerSecond: number;
  /** Total bytes processed across all iterations. */
  bytesProcessed: number;
  memory: MemorySnapshot;
  runtime: RuntimeSnapshot;
}

/** Envelope for successful API responses. */
export interface ApiSuccessResponse<T> {
  data: T;
  meta: {
    durationNs: number;
    durationMs: number;
    timestamp: string;
  };
}

/** Envelope for API error responses (produced by the global error handler). */
export interface ApiErrorResponse {
  error: {
    message: string;
    details?: unknown;
    /** Only present when NODE_ENV !== "production". */
    stack?: string;
  };
}
