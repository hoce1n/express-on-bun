# Architecture

## Purpose

An open, transparent benchmarking platform that measures **real-world**
performance on the **Bun** runtime: heavy computational stress tests
(parsing multi-MB JSON payloads, complex regex matching over large text
buffers) timed with `Bun.nanoseconds()` and reported alongside
`process.memoryUsage()` snapshots. Everything the benchmark measures is
disclosed — inputs, iterations, wall-clock nanoseconds, and the machine's
runtime profile — so results are reproducible, not marketing claims.

## Repository layout

```
.
├── apps/
│   ├── api/                    # Backend: Express running natively on Bun
│   │   ├── src/
│   │   │   ├── index.ts        # Entrypoint: listen + graceful shutdown
│   │   │   ├── app.ts          # Express app factory (middleware + routes)
│   │   │   ├── config/env.ts   # Zod-validated runtime configuration
│   │   │   ├── lib/            # timing (Bun.nanoseconds/GC), memory,
│   │   │   │                   # regex worker protocol + runner
│   │   │   ├── middleware/     # metrics, error-handler, not-found
│   │   │   ├── routes/         # health, benchmarks (json_parse, regex_match)
│   │   │   └── workers/        # regex-bench-worker (timeout-bounded regex)
│   │   └── tests/              # bun:test smoke + benchmark integration tests
│   └── dashboard/              # Frontend: Vite + React static dashboard
│       ├── src/                # React workspace (lib/ api client + presets,
│       │                       # hooks/, components/, results panels)
│       ├── vite.config.ts      # dev proxy /api -> :3000, allowedHosts
│       └── vercel.json         # static deploy config for Vercel
├── packages/
│   └── shared/                 # Shared API contracts (@bench/shared)
├── Dockerfile                  # Multi-stage oven/bun:1 image for the API
├── docker-compose.yml          # Local backend orchestration
├── vercel.json                 # Vercel monorepo config: builds apps/dashboard
└── tsconfig.base.json          # Shared strict TS compiler options
```

## Components

### 1. Backend API (`@bench/api`)

- **Runtime**: Bun (`oven/bun:1` in production). Express 5 runs natively on
  Bun — no Node compatibility layer, no transpile step at runtime.
- **Configuration**: `src/config/env.ts` validates `process.env` through
  zod and exits fast on invalid values. All knobs have safe defaults.
- **Middleware stack** (order matters):
  1. `helmet()` — hardened security headers.
  2. `cors()` — permissive by default; tighten per deployment.
  3. `metricsMiddleware()` — `Bun.nanoseconds()` request timing plus
     `process.memoryUsage()` heap deltas, emitted as
     `x-bench-duration-ns` / `x-bench-heap-delta-bytes` headers.
  4. `express.json({ limit: MAX_BODY_MB })` — bounded body parsing so
     oversized payloads are rejected before allocation becomes a risk.
  5. Routers — `/health` and `/api/health` (liveness, same handler) and
     `/api/v1/benchmarks/*` (`json_parse`, `regex_match`, `system-info`).
  6. `notFoundHandler` + `errorHandler` — structured JSON 404/5xx,
     never crashes on malformed input.
- **Precision timing**: `src/lib/timing.ts` wraps `Bun.nanoseconds()` for
  wall-clock measurements; benchmark results report `durationNs`.
- **Memory tracking**: `src/lib/memory.ts` projects
  `process.memoryUsage()` into typed snapshots included in every result.

### 2. Dashboard (`@bench/dashboard`)

- **Stack**: Vite + React 19 + TypeScript, static build output.
- **Workspace layout** (`src/`):
  - `lib/api.ts` — API client. `fetch` wrapper that normalizes the
    `ApiSuccessResponse` / `ApiErrorResponse` envelopes into typed results
    or `ApiError`, and surfaces the `x-bench-duration-ns` /
    `x-bench-heap-delta-bytes` trace headers.
  - `lib/presets.ts` — deterministic (fixed-seed PRNG) payload builders:
    a ~1.5MB nested JSON document and a ~200KB email-peppered log, plus a
    catastrophic-backtracking regex preset for exercising the timeout path.
  - `hooks/useBenchmark.ts` — run lifecycle (idle → running → success/error)
    shared by both benchmark tabs.
  - `components/` — live `RuntimeStatus` bar (liveness + system-info,
    auto-refresh), `Tabs`, per-benchmark `JsonParseTab` / `RegexMatchTab`,
    and `results/` metric cards, result panel, and header inspector.
- **Dev proxy**: `vite.config.ts` forwards `/api/*` to
  `http://localhost:3000`, so local development is same-origin.
- **Deployment**: built to `dist/` and served by Vercel
  (`vercel.json`). An external-origin rewrite forwards `/api/:path*` to the
  deployed backend, and an SPA fallback rewrite routes all other paths to
  `index.html`.
- **API base URL**: `import.meta.env.VITE_API_BASE_URL` (defaults to
  `/api`). Locally the Vite proxy handles it. In production, either set
  `VITE_API_BASE_URL` to the deployed backend URL (baked in at build time),
  or leave it as `/api` and let the Vercel `/api/*` rewrite proxy to the
  backend service.
- **CORS**: the API exposes `x-bench-duration-ns` /
  `x-bench-heap-delta-bytes` via `cors({ exposedHeaders })` so the header
  inspector works cross-origin in production, not just through the dev proxy.

### 3. Shared contracts (`@bench/shared`)

Single source of truth for request/response types consumed by both the API
(TypeScript + Express, via `bun build`) and the dashboard (via Vite).
No build step — workspace source is imported directly.

## Communication flow

```
┌──────────────┐   fetch('/api/v1/benchmarks/json-parse')
│  Browser     │──────────────────────────────────────────┐
│  (React SPA) │                                          │
└──────┬───────┘                                          │
       │  same-origin, no CORS                            │
       ▼                                                  ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ Dashboard host               │        │ Bun + Express API (@bench/api)│
│  dev: Vite dev server        │ /api/* │  Docker / oven/bun:1         │
│  prod: Vercel static +       │───────►│  helmet → cors → metrics →   │
│        rewrite to API URL    │        │  json(limit) → routes        │
└──────────────────────────────┘        └──────────────┬───────────────┘
                                                       │
                                                       ▼
                              ┌──────────────────────────────────────┐
                              │ Shared contracts (@bench/shared)      │
                              │ BenchmarkRequest / BenchmarkResult    │
                              │ ApiSuccessResponse / ApiErrorResponse │
                              └──────────────────────────────────────┘
```

- **Local dev**: browser → Vite dev server (`:5173`) → proxy `/api` →
  Bun API (`:3000`). One origin, zero CORS configuration.
- **Production**: browser → Vercel static dashboard. Either `VITE_API_BASE_URL`
  points the dashboard at the deployed backend URL directly, or (when unset)
  the Vercel `/api/*` rewrite proxies to the backend service. The API runs
  as a Docker container on any container host.
- **Both** consume `@bench/shared` types, keeping the wire contract in
  sync without drift.

## API contract

Mounted under `/api/v1/benchmarks` (`src/routes/benchmarks.ts`):

| Endpoint                | Method | Purpose                                        |
| ----------------------- | ------ | ---------------------------------------------- |
| `/api/v1/benchmarks/json-parse` | POST | Parse multi-MB JSON documents, measure ns + throughput |
| `/api/v1/benchmarks/regex-match` | POST | Run regex over a large text buffer (worker + timeout)  |
| `/api/v1/benchmarks/system-info` | GET  | RuntimeSnapshot for result normalization       |

Every benchmark returns an `ApiSuccessResponse<BenchmarkResult>` envelope;
failures return a structured `{ error: { code, ... } }` envelope with stable
codes (`INVALID_PAYLOAD`, `MALFORMED_JSON`, `INVALID_REGEX`, `REGEX_TIMEOUT`,
`PAYLOAD_TOO_LARGE`, `NOT_FOUND`, `INTERNAL_ERROR`). The metrics middleware
attaches `x-bench-duration-ns` to every response for transparent HTTP
tracing.

### Benchmark engine semantics

- **Precision timing**: the timed section is measured with
  `Bun.nanoseconds()` and reported as `executionTimeNs` /
  `executionTimeMs`. For `regex_match`, timing happens *inside* the worker so
  message-passing overhead is excluded.
- **GC discipline**: `Bun.gc(true)` is forced before each run for a clean
  heap baseline; `gcForced` is reported so warm-vs-cold runs are
  distinguishable.
- **Memory**: `process.memoryUsage()` snapshots are captured before and
  after the timed section and reported as `before` / `after` / `delta`.
  For `regex_match` the snapshots are taken inside the worker, where the
  execution memory actually lives.
- **Throughput**: `throughputMBps = bytesProcessed / 1e6 / seconds`, where
  `bytesProcessed` uses UTF-8 byte length of the input across iterations.

### Regex safety

Catastrophic backtracking cannot be detected statically and blocks the
executing thread synchronously. `regex_match` therefore runs in a dedicated
`Worker` (`src/workers/regex-bench-worker.ts`) that the runner
(`src/lib/regex-worker-runner.ts`) terminates after `REGEX_TIMEOUT_MS`,
rejecting the request with `REGEX_TIMEOUT` instead of freezing the server.
Patterns are also pre-compiled on the main thread so invalid regexes return
`INVALID_REGEX` without a worker round-trip.

### Input guards

- Bounded JSON bodies via `MAX_BODY_MB` (`express.json` limit).
- `BENCH_MAX_ITERATIONS` caps per-request iterations.
- `BENCH_MAX_TEXT_CHARS` caps the regex source-text buffer.
- A match counter (`MAX_MATCHES_PER_PASS`) bounds worst-case match passes.

## Deployment

- **API (Docker)**: `docker build -t bun-bench/api .` → run
  `docker run -p 3000:3000 bun-bench/api`, or `docker compose up --build`.
  The image uses the official `oven/bun:1` base and runs as the non-root
  `bun` user with a Docker `HEALTHCHECK` against `/health`.
- **Dashboard (Vercel)**: the root `vercel.json` declares a `builds` entry
  whose `src` points at `apps/dashboard/package.json`, so Vercel builds the
  dashboard from `apps/dashboard` and serves the static output from
  `apps/dashboard/dist`. The `rewrites` block adds the SPA fallback. Set
  `VITE_API_BASE_URL` to the deployed API URL.

## Development

```bash
bun install            # install all workspaces, frozen lockfile
bun run dev:api        # API on :3000 with --watch
bun run dev:dashboard  # dashboard on :5173, proxies /api to :3000
bun run typecheck      # tsc --noEmit for every workspace
bun run test           # bun:test across workspaces
bun run build          # bundle API (dist/) + build dashboard (dist/)
```
