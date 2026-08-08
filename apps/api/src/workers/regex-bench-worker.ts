import { memoryDelta, sampleMemory } from '../lib/memory';
import {
  MAX_MATCHES_PER_PASS,
  type RegexBenchJob,
  type RegexBenchWorkerResponse,
} from '../lib/regex-protocol';
import { elapsedNs, nowNs, tryForceGc } from '../lib/timing';

/**
 * Regex benchmark worker.
 *
 * Executes the timed regex passes in a dedicated thread so the main event
 * loop is never blocked by a hostile pattern. Reports its own
 * `Bun.nanoseconds()` timing and `process.memoryUsage()` snapshots so the
 * measurement is not polluted by message-passing overhead.
 *
 * `globalThis` in a dedicated worker *is* the worker scope, but we type it
 * narrowly here to avoid depending on ambient web-worker declarations.
 */
const workerGlobal = globalThis as unknown as {
  onmessage: ((event: { data: RegexBenchJob }) => void) | null;
  postMessage: (message: RegexBenchWorkerResponse) => void;
};

workerGlobal.onmessage = (event) => {
  const { text, pattern, flags, iterations } = event.data;

  let response: RegexBenchWorkerResponse;
  try {
    const regex = new RegExp(pattern, flags);

    tryForceGc();
    const before = sampleMemory();
    const startedAt = nowNs();

    let itemsProcessed = 0;
    for (let i = 0; i < iterations; i++) {
      if (regex.global || regex.sticky) regex.lastIndex = 0;
      itemsProcessed += countMatches(text, regex);
    }

    const durationNs = elapsedNs(startedAt);
    const after = sampleMemory();

    response = {
      ok: true,
      itemsProcessed,
      durationNs,
      memory: { before, after, delta: memoryDelta(before, after) },
    };
  } catch (err) {
    response = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  workerGlobal.postMessage(response);
};

/**
 * Count matches for one pass over `text`.
 * - Global/sticky regexes iterate with `exec` so matches are counted without
 *   materializing a potentially huge result array.
 * - Non-global regexes short-circuit at the first match.
 */
function countMatches(text: string, regex: RegExp): number {
  if (regex.global || regex.sticky) {
    let count = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      count++;
      if (count >= MAX_MATCHES_PER_PASS) break;
      // Zero-length matches must advance to guarantee termination.
      if (match[0].length === 0 && regex.lastIndex === match.index) {
        regex.lastIndex = match.index + 1;
      }
    }
    return count;
  }
  return regex.test(text) ? 1 : 0;
}
