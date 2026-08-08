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
