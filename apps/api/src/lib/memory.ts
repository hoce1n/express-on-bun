import type { MemorySample } from '@bench/shared';

/**
 * Memory introspection helpers around `process.memoryUsage()`.
 *
 * Used to (a) report resource consumption alongside benchmark results and
 * (b) guard endpoints against runaway allocations. `MemoryStats` is kept
 * structurally identical to `@bench/shared`'s `MemorySample` so results
 * are always assignable to the wire contract.
 */

export type MemoryStats = MemorySample;

export function sampleMemory(): MemoryStats {
  const m = process.memoryUsage();
  return {
    rss: m.rss,
    heapTotal: m.heapTotal,
    heapUsed: m.heapUsed,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
  };
}

/** Compute the per-field delta between two memory snapshots. */
export function memoryDelta(before: MemoryStats, after: MemoryStats): MemoryStats {
  return {
    rss: after.rss - before.rss,
    heapTotal: after.heapTotal - before.heapTotal,
    heapUsed: after.heapUsed - before.heapUsed,
    external: after.external - before.external,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
  };
}

/** Alias kept for callers that already import `getMemoryStats`. */
export const getMemoryStats: typeof sampleMemory = sampleMemory;

/** Human-readable helper: bytes to MiB. */
export function mb(bytes: number): number {
  return bytes / 1024 / 1024;
}
