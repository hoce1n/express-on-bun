import { existsSync } from 'node:fs';
import { HttpError } from '../middleware/error-handler';
import type {
  RegexBenchJob,
  RegexBenchOkResult,
  RegexBenchWorkerResponse,
} from './regex-protocol';

/**
 * Worker entry resolution.
 *
 * In the production bundle the worker is emitted next to the bundled entry
 * (dist/regex-bench-worker.js); in dev/source it lives two directories up
 * (src/workers/regex-bench-worker.ts). Resolved once at module load.
 */
const WORKER_URL: URL = (() => {
  // Production bundle: emitted at dist/workers/regex-bench-worker.js
  // (mirrors the source path relative to the output directory).
  const bundled = new URL('./workers/regex-bench-worker.js', import.meta.url);
  if (existsSync(bundled)) return bundled;
  // Dev / source: worker lives two directories up in src/workers/.
  return new URL('../workers/regex-bench-worker.ts', import.meta.url);
})();

/**
 * Execute a regex benchmark in a dedicated worker with a hard wall-clock
 * timeout.
 *
 * Regex safety: catastrophic backtracking cannot be detected statically and
 * blocks the executing thread synchronously, so a hostile pattern running on
 * the main thread would freeze the server. By running the match in a Worker
 * we can `terminate()` it when the deadline passes and reject the request.
 */
export async function runRegexBenchmark(
  job: RegexBenchJob,
  timeoutMs: number,
): Promise<RegexBenchOkResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { type: 'module' });

    let settled = false;

    // Whatever the outcome, clear the timer and release the worker thread.
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(
        new HttpError(
          400,
          `regex execution exceeded ${timeoutMs}ms timeout (possible catastrophic backtracking)`,
          'REGEX_TIMEOUT',
        ),
      );
    }, timeoutMs);
    timer.unref();

    worker.onmessage = (event: MessageEvent<RegexBenchWorkerResponse>) => {
      if (settled) return;
      finish();
      const message = event.data;
      if (message.ok) {
        resolve(message);
      } else {
        reject(
          new HttpError(400, `invalid regex: ${message.message}`, 'INVALID_REGEX'),
        );
      }
    };

    worker.onerror = (event) => {
      if (settled) return;
      finish();
      reject(
        new HttpError(500, 'regex worker failed', 'INTERNAL_ERROR', {
          message: event.message,
        }),
      );
    };

    worker.postMessage(job);
  });
}
