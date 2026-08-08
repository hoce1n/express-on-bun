/** Presentation helpers for benchmark metrics. */

/** Millisecond duration with a fixed number of decimals. */
export function formatMs(ms: number, digits = 2): string {
  return `${ms.toFixed(digits)} ms`;
}

/** Human-friendly nanosecond duration (ns → µs → ms). */
export function formatNs(ns: number): string {
  if (!Number.isFinite(ns)) return 'n/a';
  if (ns < 1_000) return `${Math.round(ns)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  return `${(ns / 1_000_000).toFixed(3)} ms`;
}

/** Human-friendly byte count (B → KB → MB → GB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

/** Throughput in MB/s with two decimals. */
export function formatMBps(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(2)} MB/s`;
}

/** Integer count with thousands separators. */
export function formatCount(count: number): string {
  return Number.isFinite(count) ? count.toLocaleString('en-US') : 'n/a';
}

/** Exact UTF-8 byte length of a string. */
export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}
