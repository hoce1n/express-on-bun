/**
 * Wall-clock timing primitives built on `Bun.nanoseconds()`.
 *
 * `Bun.nanoseconds()` returns the current wall-clock time in nanoseconds
 * with much finer resolution than `process.hrtime.bigint()`/`Date.now()`,
 * which makes it the right clock for microbenchmark measurements.
 */

/** Current wall-clock time in nanoseconds. */
export function nowNs(): number {
  return Bun.nanoseconds();
}

/** Difference between a captured start time and now, in nanoseconds. */
export function elapsedNs(startNs: number): number {
  return nowNs() - startNs;
}

export function nsToMs(ns: number): number {
  return ns / 1_000_000;
}

export function nsToSec(ns: number): number {
  return ns / 1_000_000_000;
}

/** Throughput in MB/s given total bytes processed and elapsed nanoseconds. */
export function throughputMBps(bytesProcessed: number, durationNs: number): number {
  if (bytesProcessed <= 0 || durationNs <= 0) return 0;
  const seconds = nsToSec(durationNs);
  if (seconds <= 0) return 0;
  return bytesProcessed / 1_000_000 / seconds;
}

/**
 * Attempt to force a full, synchronous garbage collection.
 *
 * `Bun.gc(true)` runs a synchronous full GC on the Bun runtime. On a
 * non-Bun runtime we fall back to `globalThis.gc` (Node launched with
 * `--expose-gc`). If no hook is available we report `false` so callers
 * know the run is a "warm" measurement rather than a cold, clean-heap one.
 *
 * Forcing GC before a run gives a stable heap baseline, so the before/after
 * memory delta better approximates the operation's real allocation overhead.
 */
export function tryForceGc(): boolean {
  try {
    if (typeof Bun.gc === 'function') {
      Bun.gc(true);
      return true;
    }
  } catch {
    // fall through to the Node-style hook
  }
  try {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (typeof gc === 'function') {
      gc();
      return true;
    }
  } catch {
    // ignore; GC is best-effort
  }
  return false;
}
