/**
 * Production build for the API.
 *
 * Bundles the server entry AND the regex benchmark worker into `dist/`.
 * The worker must be a separate emitted artifact because it is instantiated
 * at runtime via `new Worker(...)` — a plain `bun build <entry>` does not
 * inline web-worker entry points.
 */
import { build } from 'bun';

const result = await build({
  entrypoints: [
    './src/index.ts',
    './src/workers/regex-bench-worker.ts',
  ],
  target: 'bun',
  outdir: './dist',
  sourcemap: 'external',
});

if (!result.success) {
  console.error('[build] failed', result.logs);
  process.exit(1);
}

for (const output of result.outputs) {
  console.log(`[build] ${output.path}`);
}
