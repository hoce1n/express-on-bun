import { useEffect, useState } from 'react';
import type { SystemInfo } from '@bench/shared';
import { API_BASE_URL, ApiError, fetchHealth, fetchSystemInfo } from '../lib/api';

type Health = 'loading' | 'online' | 'offline';

const HEALTH_LABEL: Record<Health, string> = {
  loading: 'Checking API',
  online: 'API online',
  offline: 'API unreachable',
};

/**
 * Live status bar: probes the API liveness endpoint and the system-info
 * endpoint, re-checking on an interval so the runtime context stays fresh.
 */
export function RuntimeStatus() {
  const [health, setHealth] = useState<Health>('loading');
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async (): Promise<void> => {
    try {
      const [systemInfo] = await Promise.all([fetchSystemInfo(), fetchHealth()]);
      setInfo(systemInfo);
      setHealth('online');
      setMessage(null);
    } catch (err) {
      setHealth('offline');
      setMessage(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detail = info
    ? `${info.engine.bun} · ${info.platform}/${info.arch} · ${info.cpuCount} cores`
    : null;

  return (
    <section className="status" aria-live="polite">
      <span
        className={`dot is-${health}`}
        aria-hidden="true"
      />
      <span>{HEALTH_LABEL[health]}</span>
      {detail ? <span className="status-sub">{detail}</span> : null}
      {message ? <span className="status-error">{message}</span> : null}
      <span className="status-actions">
        <button type="button" className="btn-ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </span>
      <code>{API_BASE_URL}</code>
    </section>
  );
}
