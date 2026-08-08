import { useCallback, useState } from 'react';
import type { BenchmarkRequest, BenchmarkResult } from '@bench/shared';
import { ApiError, runBenchmark } from '../lib/api';

export type BenchmarkRunState =
  | { status: 'idle' }
  | { status: 'running' }
  | {
      status: 'success';
      result: BenchmarkResult;
      serverDurationMs: number;
      headers: Record<string, string>;
    }
  | { status: 'error'; error: ApiError };

/**
 * Orchestrates a single benchmark run: manages the idle → running → done
 * lifecycle and normalizes network/API failures into ApiError instances.
 */
export function useBenchmark() {
  const [state, setState] = useState<BenchmarkRunState>({ status: 'idle' });

  const run = useCallback(async (request: BenchmarkRequest): Promise<void> => {
    setState({ status: 'running' });
    try {
      const { result, meta, headers } = await runBenchmark(request);
      setState({
        status: 'success',
        result,
        serverDurationMs: meta.durationMs,
        headers,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setState({ status: 'error', error: err });
      } else {
        setState({
          status: 'error',
          error: new ApiError(
            0,
            'UNKNOWN_ERROR',
            err instanceof Error ? err.message : String(err),
          ),
        });
      }
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, run, reset };
}
