# BunMark

> Transparent, real-world benchmarking on the **Bun** runtime.

## Overview

BunMark exists for one reason: marketing numbers are not measurements.
Benchmarks on vendor homepages usually run a single warm pass on a tuned
machine and report only the winner. BunMark inverts that — it measures
**actual runtime performance under high-stress workloads** (multi-MB JSON
parsing, complex regex matching over large text buffers) and discloses every
input, iteration, wall-clock nanosecond, memory delta, and the host's runtime
profile. If you want to know how Bun really behaves when a payload is heavy
or a pattern is hostile, BunMark is the honest answer.

## Features

- **ns-precision timing** via `Bun.nanoseconds()` around every timed pass.
- **GC discipline** — a full `Bun.gc(true)` before each run plus
  `process.memoryUsage()` before/after/delta snapshots, so warm vs. cold
  runs are distinguishable.
- **Throughput reporting** — bytes processed per second (MB/s), item counts,
  and per-iteration statistics.
- **Hostile-input safety** — regex execution runs in a dedicated worker that
  is hard-terminated by `REGEX_TIMEOUT_MS`, so catastrophic patterns can
  never freeze the server.
- **Live dashboard** — a dark, developer-focused SPA with a runtime status
  bar, JSON Parse and Regex Match workspaces, deterministic presets, metric
  visualization, and an HTTP trace-header inspector.
- **Reproducible by default** — deterministic (fixed-seed) preset payloads
  mean anyone can re-run the same measurement on their own machine.

## Architecture

```
apps/
  api/        Bun + Express backend (Docker image: oven/bun:1)
  dashboard/  Vite + React static SPA (deployed to Vercel)
packages/
  shared/     @bench/shared — single source of truth for API contracts
Dockerfile    Multi-stage production image for the API
```

The two services communicate through the `@bench/shared` TypeScript
contracts consumed directly by both sides (no build step, no drift). Locally
the Vite dev server reverse-proxies `/api/*` to the Bun API so everything is
same-origin; in production the static dashboard calls the deployed API URL
set via `VITE_API_BASE_URL`. See `docs/ARCHITECTURE.md` for the full layout,
middleware stack, and request flow.

## Bun Regex Insight

**Bun's regex engine neutralizes classic catastrophic backtracking.**

Patterns widely used to demonstrate exponential regex blowup —
`(a+)+$`, `(a|a)+$`, `(a+)+b`, `a*a*a*a*a*a*a*a*b` — complete on Bun
1.3.14 (JavaScriptCore) with a **roughly constant ~1.1 s penalty that is
independent of input size** (verified from 64 up to 100,000 characters). On
most backtracking engines (PCRE, Python `re`, .NET) the same inputs hang for
seconds, minutes, or exponentially longer.

The dashboard ships a **Backtracking stress** preset
(pattern `(a+)+$` over a 10 KB failing buffer) so you can reproduce this
yourself with one click.

Defense in depth is still in place: every regex run executes in a dedicated
worker that `REGEX_TIMEOUT_MS` (default `5000`) hard-terminates, so even a
pattern that does blow up can never freeze the API server.

## Getting Started (Local Development)

Prerequisites: [Bun](https://bun.sh) >= 1.1.

```bash
bun install
```

Start the API on `http://localhost:3000`:

```bash
bun run dev:api
```

In a second terminal, start the dashboard on `http://localhost:5173`
(its dev server proxies `/api/*` to the backend):

```bash
bun run dev:dashboard
```

Open http://localhost:5173 and run a benchmark.

Verify the workspace is healthy:

```bash
bun run typecheck
bun test
bun run build
```

## Production Deployment Guide

### Dashboard → Vercel

1. Create a Vercel project from the repository (or `cd apps/dashboard && vercel deploy`).
2. Framework preset: **Vite**.
3. Build command: `bun run build` (declared in `apps/dashboard/vercel.json`).
4. Output directory: `dist` (declared in `apps/dashboard/vercel.json`).
5. Set the environment variable `VITE_API_BASE_URL` to your deployed API
   URL (leave unset/`/api` only when the API is on the same origin). It is
   baked in at build time.
6. `apps/dashboard/vercel.json` also includes an SPA fallback rewrite so
   client-side routes never 404 while `/api/*` requests pass through.

### API → Docker

Build and run the production image:

```bash
docker build -t bunmark/api .
docker run -d --name bunmark-api -p 3000:3000 bunmark/api
```

Or use the bundled compose file:

```bash
docker compose up --build
```

The multi-stage image:

- Builds from the official `oven/bun:1` base and bundles the API (including
  `@bench/shared`) into a single file with `bun build --target bun`.
- Runs as the non-root `bun` user with a Docker `HEALTHCHECK` against
  `/health`.
- Reads all configuration from environment variables (see `.env.example`),
  validated by zod at boot.

Deploy the image to any container host — Fly.io, ECS, EKS, Railway, Cloud
Run, etc. Point your load balancer at port `3000` and use `/health` (or
`/api/health`) as the liveness probe.

## Configuration

Copy `.env.example` to `.env` for local development. Key settings:

| Variable             | Default      | Purpose                                    |
| -------------------- | ------------ | ------------------------------------------ |
| `PORT`               | `3000`       | API listen port                            |
| `HOST`               | `0.0.0.0`    | API bind host                              |
| `MAX_BODY_MB`        | `20`         | Request body cap (bounded, stress-ready)   |
| `TRUST_PROXY`        | `loopback`   | Express `trust proxy` setting              |
| `REGEX_TIMEOUT_MS`   | `5000`       | Worker hard-kill timeout for regex runs    |
| `BENCH_MAX_ITERATIONS` | `100`      | Per-request iteration cap                  |
| `BENCH_MAX_TEXT_CHARS` | `16777216` | Regex source-text buffer cap               |
| `VITE_API_BASE_URL`  | `/api`       | Dashboard API base (proxy/rewrite aware)   |

## Security & Robustness Baseline

- `helmet()` security headers, CORS enabled, `x-powered-by` disabled.
- Bounded JSON body parsing (`MAX_BODY_MB`) rejects oversized payloads
  before allocation risk.
- Centralized error handler turns every failure into a structured JSON
  envelope with stable codes — malformed input returns 400, never a crash.
- Request-level instrumentation reports `Bun.nanoseconds()` timing and heap
  deltas on every response (`x-bench-duration-ns`, `x-bench-heap-delta-bytes`).
- Container runs as a non-root user with a `HEALTHCHECK`.

## API Contract

Mounted under `/api/v1/benchmarks`:

| Endpoint                          | Method | Purpose                                          |
| --------------------------------- | ------ | ------------------------------------------------ |
| `/api/v1/benchmarks/json-parse`   | POST   | Parse multi-MB JSON, measure ns + throughput      |
| `/api/v1/benchmarks/regex-match`  | POST   | Regex over large text (worker + hard timeout)     |
| `/api/v1/benchmarks/system-info`  | GET    | Runtime snapshot for result normalization         |

Success returns an `ApiSuccessResponse<BenchmarkResult>` envelope; failures
return a structured `{ error: { code, ... } }` envelope with stable codes
(`INVALID_PAYLOAD`, `MALFORMED_JSON`, `INVALID_REGEX`, `REGEX_TIMEOUT`,
`PAYLOAD_TOO_LARGE`, `NOT_FOUND`, `INTERNAL_ERROR`). `/health` (and its
`/api/health` alias) report liveness.

## Status

Foundation, benchmarking engine, and live dashboard are complete and
verified end-to-end. The repo is a private monorepo (internal package name
`bun-bench-platform`); **BunMark** is the product name.
