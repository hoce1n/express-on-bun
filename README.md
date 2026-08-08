# Bun Benchmark Platform

An open, transparent benchmarking platform that measures real-world
performance on the **Bun** runtime — heavy computational stress tests
(multi-MB JSON parsing, complex regex matching over large text buffers)
timed with `Bun.nanoseconds()` and reported alongside
`process.memoryUsage()` snapshots. Inputs, iterations, wall-clock
nanoseconds, and the machine's runtime profile are all disclosed, so
results are reproducible rather than marketing claims.

## Repository structure

```
apps/
  api/        Express.js backend running natively on Bun (Docker image: oven/bun:1)
  dashboard/  Vite + React static dashboard (deployed to Vercel)
packages/
  shared/     Shared API contracts consumed by both sides
Dockerfile    Multi-stage production image for the API
```

See `docs/ARCHITECTURE.md` for the full layout and communication flow.

## Quick start

Prerequisites: [Bun](https://bun.sh) >= 1.1.

```bash
bun install              # install all workspaces (frozen lockfile)
bun run dev:api          # API on http://localhost:3000
bun run dev:dashboard    # dashboard on http://localhost:5173, proxies /api -> :3000
```

Then open http://localhost:5173. The dashboard dev server reverse-proxies
`/api/*` to the Bun backend, so everything is same-origin.

## Useful commands

```bash
bun run typecheck   # tsc --noEmit across api, dashboard, shared
bun run test        # bun:test smoke tests (health + error envelopes)
bun run build       # bundle the API to apps/api/dist, build dashboard to dist/
```

## Docker (backend API)

```bash
docker build -t bun-bench/api .
docker run -p 3000:3000 bun-bench/api
# or
docker compose up --build
```

The image is built from the official `oven/bun:1` base, bundles the API
(including `@bench/shared`) into a single file with `bun build --target bun`,
runs as the non-root `bun` user, and health-checks `/health`.

## Deployment

- **API**: any container host (Fly.io, ECS, EKS, Railway...). Configuration
  is read from environment variables (see `.env.example`); every value is
  validated by zod at boot.
- **Dashboard**: static build served by Vercel. `apps/dashboard/vercel.json`
  declares the build command, output directory, and an SPA fallback rewrite.
  Set `VITE_API_BASE_URL` to the deployed API URL for production.

## Configuration

Copy `.env.example` to `.env` for local development. Key settings:

| Variable         | Default     | Purpose                                   |
| ---------------- | ----------- | ----------------------------------------- |
| `PORT`           | `3000`      | API listen port                           |
| `HOST`           | `0.0.0.0`   | API bind host                             |
| `MAX_BODY_MB`    | `20`        | Request body cap (bounded, stress-ready)  |
| `TRUST_PROXY`    | `loopback`  | Express `trust proxy` setting             |
| `VITE_API_BASE_URL` | `/api`    | Dashboard API base (proxy/rewrite aware)  |

## Security & robustness baseline

- `helmet()` security headers, CORS enabled, `x-powered-by` disabled.
- Bounded JSON body parsing (`MAX_BODY_MB`) rejects oversized payloads
  before allocation risk.
- Centralized error handler converts every failure into a structured JSON
  envelope — malformed input returns 400, never a crash.
- Request-level instrumentation reports `Bun.nanoseconds()` timing and
  heap deltas on every response.
- Container runs as non-root `bun` user with a `HEALTHCHECK`.

## Status

- Foundation complete: workspace monorepo, API boot + `/health`,
  dashboard shell, Docker image, shared contracts.
- Core benchmarking engine live:
  - `POST /api/v1/benchmarks/json-parse` — multi-MB JSON parsing measured
    with `Bun.nanoseconds()`, GC-forced baseline, memory before/after/delta,
    item count and throughput (MB/s).
  - `POST /api/v1/benchmarks/regex-match` — regex over large text buffers,
    executed in a timeout-bounded worker so catastrophic patterns cannot
    freeze the server.
  - `GET /api/v1/benchmarks/system-info` — runtime context for result
    normalization.
- Next: dashboard wiring (benchmark runner + result charts).
