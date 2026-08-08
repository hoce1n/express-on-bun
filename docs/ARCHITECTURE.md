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
│   │   │   ├── lib/            # timing.ts (Bun.nanoseconds), memory.ts
│   │   │   ├── middleware/     # metrics, error-handler, not-found
│   │   │   └── routes/         # health, benchmarks (stub)
│   │   └── tests/              # bun:test smoke tests
│   └── dashboard/              # Frontend: Vite + React static dashboard
│       ├── src/                # React app shell (placeholder)
│       ├── vite.config.ts      # dev proxy /api -> :3000, allowedHosts
│       └── vercel.json         # static deploy config for Vercel
├── packages/
│   └── shared/                 # Shared API contracts (@bench/shared)
├── Dockerfile                  # Multi-stage oven/bun:1 image for the API
├── docker-compose.yml          # Local backend orchestration
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
  5. Routers — `/health` (liveness) and `/api/v1/benchmarks/*` (stub).
  6. `notFoundHandler` + `errorHandler` — structured JSON 404/5xx,
     never crashes on malformed input.
- **Precision timing**: `src/lib/timing.ts` wraps `Bun.nanoseconds()` for
  wall-clock measurements; benchmark results report `durationNs`.
- **Memory tracking**: `src/lib/memory.ts` projects
  `process.memoryUsage()` into typed snapshots included in every result.

### 2. Dashboard (`@bench/dashboard`)

- **Stack**: Vite + React 19 + TypeScript, static build output.
- **Dev proxy**: `vite.config.ts` forwards `/api/*` to
  `http://localhost:3000`, so local development is same-origin.
- **Deployment**: built to `dist/` and served by Vercel
  (`apps/dashboard/vercel.json`). SPA fallback rewrite routes non-`/api`
  paths to `index.html`.
- **API base URL**: `import.meta.env.VITE_API_BASE_URL` (defaults to
  `/api`). Locally the proxy handles it; in production it points at the
  deployed backend URL.

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
- **Production**: browser → Vercel static dashboard. `/api/*` is rewritten
  to the deployed backend URL (`VITE_API_BASE_URL` baked at build time).
  The API runs as a Docker container on any container host.
- **Both** consume `@bench/shared` types, keeping the wire contract in
  sync without drift.

## Planned API contract (not yet implemented)

Mounted under `/api/v1/benchmarks`, implemented in `src/routes/benchmarks.ts`:

| Endpoint                | Method | Purpose                                        |
| ----------------------- | ------ | ---------------------------------------------- |
| `/api/v1/benchmarks/json-parse` | POST | Multi-MB JSON stringify/parse stress test      |
| `/api/v1/benchmarks/regex-match` | POST | Complex regex over a large text buffer         |
| `/api/v1/benchmarks/system-info` | GET  | RuntimeSnapshot for result normalization       |

Handlers validate input with zod against `@bench/shared`, measure with
`Bun.nanoseconds()`, snapshot memory before/after, and return a
`BenchmarkResult` envelope. The `/health` liveness endpoint is live today.

## Deployment

- **API (Docker)**: `docker build -t bun-bench/api .` → run
  `docker run -p 3000:3000 bun-bench/api`, or `docker compose up --build`.
  The image uses the official `oven/bun:1` base and runs as the non-root
  `bun` user with a Docker `HEALTHCHECK` against `/health`.
- **Dashboard (Vercel)**: import `apps/dashboard` as the root directory of
  a Vercel project (or use the root with project settings pointing at
  `apps/dashboard`). `vercel.json` sets the build command, output dir, and
  SPA rewrite. Set `VITE_API_BASE_URL` to the deployed API URL.

## Development

```bash
bun install            # install all workspaces, frozen lockfile
bun run dev:api        # API on :3000 with --watch
bun run dev:dashboard  # dashboard on :5173, proxies /api to :3000
bun run typecheck      # tsc --noEmit for every workspace
bun run test           # bun:test across workspaces
bun run build          # bundle API (dist/) + build dashboard (dist/)
```

> Note: the root-level `src/`, `public/`, `components/`, and `vercel.json`
> are leftover artifacts of the original Vercel express-bun template and
> are intentionally kept untouched. They are not part of the platform.
