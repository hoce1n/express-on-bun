/**
 * Dashboard shell — placeholder foundation.
 *
 * Planned screens (later milestones):
 *   - Benchmark runner form (payload size, iterations) -> POST /api/v1/benchmarks/*
 *   - Result viewer with ns-precision timings and memory curves
 *   - System/runtime context from GET /api/v1/benchmarks/system-info
 *
 * API base URL comes from VITE_API_BASE_URL (defaults to "/api" so the
 * local Vite proxy and the Vercel rewrite both work with zero config).
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

export function App() {
  return (
    <main className="shell">
      <header>
        <h1>Bun Benchmark Platform</h1>
        <p>
          Open, transparent real-world performance measurements on the Bun
          runtime.
        </p>
      </header>

      <section className="status">
        <span className="dot" aria-hidden="true" />
        API endpoint: <code>{API_BASE_URL}</code>
      </section>

      <section className="placeholder">
        <h2>Dashboard under construction</h2>
        <p>
          Benchmark runner, result charts, and system-info panels will be
          wired up once the backend endpoints ship.
        </p>
      </section>
    </main>
  );
}
