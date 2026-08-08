import { useState } from 'react';
import type { RegexMatchRequest } from '@bench/shared';
import { useBenchmark } from '../../hooks/useBenchmark';
import { ApiError } from '../../lib/api';
import { formatBytes, utf8Length } from '../../lib/format';
import {
  BACKTRACKING_STRESS_PRESET,
  EMAIL_SCAN_PRESET,
  backtrackingStressText,
  emailLogText,
  type RegexPreset,
} from '../../lib/presets';
import { ErrorBanner } from '../ErrorBanner';
import { ResultPanel } from '../results/ResultPanel';

const MAX_ITERATIONS = 100;
const FLAG_OPTIONS = ['g', 'i', 'm'];

/** Regex Match benchmark workspace. */
export function RegexMatchTab() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<string[]>(['g', 'i']);
  const [text, setText] = useState('');
  const [iterations, setIterations] = useState(3);
  const [localError, setLocalError] = useState<ApiError | null>(null);
  const { state, run, reset } = useBenchmark();

  const textBytes = utf8Length(text);

  const applyPreset = (preset: RegexPreset, buildText?: () => string): void => {
    setPattern(preset.pattern);
    setFlags(preset.flags.split(''));
    if (buildText) setText(buildText());
  };

  const toggleFlag = (flag: string): void => {
    setFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
  };

  const handleRun = (): void => {
    if (pattern.trim().length === 0) {
      setLocalError(new ApiError(0, 'EMPTY_PATTERN', 'Enter a regex pattern (without delimiters).'));
      return;
    }
    if (text.length === 0) {
      setLocalError(new ApiError(0, 'EMPTY_TEXT', 'Enter some source text to match against.'));
      return;
    }
    try {
      new RegExp(pattern, flags.join(''));
    } catch (err) {
      setLocalError(
        new ApiError(
          0,
          'INVALID_REGEX',
          `Invalid regex: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
      return;
    }
    setLocalError(null);
    void run({ type: 'regex_match', text, pattern, flags: flags.join(''), iterations } satisfies RegexMatchRequest);
  };

  const loading = state.status === 'running';
  const activeError = state.status === 'error' ? state.error : localError;

  return (
    <div className="panel">
      <div className="row-controls">
        <label className="field">
          Pattern (no delimiters)
          <input
            type="text"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g. \b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"
            spellCheck={false}
          />
        </label>
        <div className="flag-row">
          <span className="field-label">Flags</span>
          <div className="flag-chips" role="group" aria-label="RegExp flags">
            {FLAG_OPTIONS.map((flag) => (
              <button
                key={flag}
                type="button"
                className={`flag-chip${flags.includes(flag) ? ' is-on' : ''}`}
                aria-pressed={flags.includes(flag)}
                onClick={() => toggleFlag(flag)}
              >
                {flag}
              </button>
            ))}
          </div>
        </div>
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
      </div>

      <label className="field">
        Source text
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text to match against — load a preset or paste your own buffer."
          spellCheck={false}
        />
      </label>

      <div className="input-meta">
        <span>{formatBytes(textBytes)} · {text.length.toLocaleString('en-US')} chars</span>
        <span>
          Presets: {' '}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => applyPreset(EMAIL_SCAN_PRESET, emailLogText)}
          >
            {EMAIL_SCAN_PRESET.label}
          </button>{' '}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => applyPreset(BACKTRACKING_STRESS_PRESET, backtrackingStressText)}
          >
            {BACKTRACKING_STRESS_PRESET.label}
          </button>
        </span>
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
