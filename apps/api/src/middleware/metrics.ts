import type { NextFunction, Request, Response } from 'express';
import { getMemoryStats, mb } from '../lib/memory';
import { nowNs, nsToMs } from '../lib/timing';

/**
 * Request-level instrumentation.
 *
 * Captures ultra-precise wall-clock timing via `Bun.nanoseconds()` and a
 * heap delta via `process.memoryUsage()` for every request, exposes the
 * elapsed nanoseconds in response headers, and logs a compact line.
 *
 * Headers are set by wrapping `res.end` (which runs before the response is
 * flushed), NOT the `finish` event — `finish` fires only after the response
 * is fully sent, where `setHeader` throws `ERR_HTTP_HEADERS_SENT`.
 *
 * This is infrastructure, not benchmark business logic — benchmark
 * endpoints report their own finer-grained measurements.
 */
export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAtNs = nowNs();
    const heapBefore = getMemoryStats().heapUsed;

    const originalEnd = res.end.bind(res) as (...args: never[]) => Response;

    res.end = ((...args: unknown[]) => {
      const durationNs = nowNs() - startedAtNs;
      const heapDelta = getMemoryStats().heapUsed - heapBefore;
      res.setHeader('x-bench-duration-ns', String(durationNs));
      res.setHeader('x-bench-heap-delta-bytes', String(heapDelta));
      console.log(
        `[api] ${req.method} ${req.originalUrl} ${res.statusCode} ` +
          `${nsToMs(durationNs).toFixed(3)}ms heapDelta=${mb(heapDelta).toFixed(2)}MB`,
      );
      return originalEnd.apply(res, args as never[]);
    }) as unknown as typeof res.end;

    next();
  };
}
