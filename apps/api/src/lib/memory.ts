/**
 * Memory introspection helpers around `process.memoryUsage()`.
 *
 * Used to (a) report resource consumption alongside benchmark results and
 * (b) guard endpoints against runaway allocations.
 */

export interface MemoryStats {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export function getMemoryStats(): MemoryStats {
  const m = process.memoryUsage();
  return {
    rss: m.rss,
    heapTotal: m.heapTotal,
    heapUsed: m.heapUsed,
    external: m.external,
    arrayBuffers: m.arrayBuffers,
  };
}

/** Human-readable helper: bytes to MiB. */
export function mb(bytes: number): number {
  return bytes / 1024 / 1024;
}
