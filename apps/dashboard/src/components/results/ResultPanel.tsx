import type { BenchmarkResult } from '@bench/shared';
import {
  formatBytes,
  formatCount,
  formatMBps,
  formatMs,
  formatNs,
} from '../../lib/format';
import { HeaderInspector } from './HeaderInspector';
import { MetricCard } from './MetricCard';

interface ResultPanelProps {
  result: BenchmarkResult;
  serverDurationMs: number;
  headers: Record<string, string>;
}

/** Full metric visualization for a completed benchmark run. */
export function ResultPanel({ result, serverDurationMs, headers }: ResultPanelProps) {
  const {
    executionTimeMs,
    executionTimeNs,
    throughputMBps,
    bytesProcessed,
    itemsProcessed,
    iterations,
    gcForced,
    memory,
    engine,
  } = result;

  const heapDelta = memory.delta.heapUsed;
  const rssDelta = memory.delta.rss;
  const memorySub = `heap ${formatBytes(heapDelta)} · rss ${formatBytes(rssDelta)}`;

  return (
    <section className="result-panel">
      <div className="result-head">
        <h3>Result</h3>
        <span className={`badge${gcForced ? ' badge-gc' : ' badge-muted'}`}>
          {gcForced ? 'GC forced' : 'no forced GC'}
        </span>
        <span className="engine-chip">
          Bun {engine.bun} / node {engine.node}
        </span>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="Execution time"
          value={formatMs(executionTimeMs)}
          sub={formatNs(executionTimeNs)}
        />
        <MetricCard label="Throughput" value={formatMBps(throughputMBps)} />
        <MetricCard
          label="Items processed"
          value={formatCount(itemsProcessed)}
          sub={`${formatCount(iterations)} pass${iterations === 1 ? '' : 'es'}`}
        />
        <MetricCard label="Bytes processed" value={formatBytes(bytesProcessed)} />
        <MetricCard label="Memory delta" value={formatBytes(heapDelta)} sub={memorySub} />
        <MetricCard
          label="Server duration"
          value={formatMs(serverDurationMs)}
          sub="HTTP handler wall-clock"
        />
      </div>

      <HeaderInspector headers={headers} />
    </section>
  );
}
