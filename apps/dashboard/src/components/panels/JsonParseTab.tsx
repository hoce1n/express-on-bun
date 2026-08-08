import { useMemo, useState } from 'react';
import type { JsonParseRequest } from '@bench/shared';
import { useBenchmark } from '../../hooks/useBenchmark';
import { ApiError } from '../../lib/api';
import { formatBytes, utf8Length } from '../../lib/format';
import { heavyJsonPreset } from '../../lib/presets';
import { ErrorBanner } from '../ErrorBanner';
import { ResultPanel } from '../results/ResultPanel';

const MAX_ITERATIONS = 100;

/** JSON Parse benchmark workspace. */
export function JsonParseTab() {
  const [payload, setPayload] = useState('');
  const [iterations, setIterations] = useState(5);
  const [localError, setLocalError] = useState<ApiError | null>(null);
  const { state, run, reset } = useBenchmark();

  const byteLength = useMemo(() => utf8Length(payload), [payload]);

  const handleRun = (): void => {
    if (payload.trim().length === 0) {
      setLocalError(new ApiError(0, 'EMPTY_PAYLOAD', 'Paste a JSON document or load a preset first.'));
      return;
    }
    try {
      JSON.parse(payload);
    } catch (err) {
      setLocalError(
        new ApiError(
          0,
          'MALFORMED_JSON',
          `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }
    setLocalError(null);
    void run({ type: 'json_parse', payload, iterations } satisfies JsonParseRequest);
  };

  const loading = state.status === 'running';
  const activeError = state.status === 'error' ? state.error : localError;

  return (
    <div className="panel">
      <div className="row-controls">
        <label className="field iterations">
          Iterations
          <input
            type="number"
            min={1}
            max={MAX_ITERATIONS}
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
          />
        </label>
        <div className="preset-row">
          <span>Preset</span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPayload(heavyJsonPreset())}
          >
            Load ~1.4MB heavy JSON
          </button>
        </div>
      </div>

      <label className="field">
        JSON payload
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder='Paste a JSON document, e.g. {"hello":"world"}, or load the heavy preset.'
          spellCheck={false}
        />
      </label>

      <div className="input-meta">
        <span>{formatBytes(byteLength)} · {payload.length.toLocaleString('en-US')} chars</span>
        <span>Up to {MAX_ITERATIONS} iterations · server cap {formatBytes(20 * 1024 * 1024)}</span>
      </div>

      <div>
        <button type="button" className="btn" disabled={loading} onClick={() => void handleRun()}>
          {loading ? 'Running…' : 'Run benchmark'}
        </button>
      </div>

      {activeError ? (
        <ErrorBanner
          error={activeError}
          onDismiss={localError ? () => setLocalError(null) : reset}
        />
      ) : null}

      {state.status === 'success' ? (
        <ResultPanel
          result={state.result}
          serverDurationMs={state.serverDurationMs}
          headers={state.headers}
        />
      ) : null}
    </div>
  );
}
