# syntax=docker/dockerfile:1
#
# Production image for the @bench/api service running on the official
# Bun runtime image. Multi-stage:
#   install -> resolve workspace deps into a lockfile-consistent node_modules
#   build   -> bundle the API (including @bench/shared) into a single file
#   runtime -> minimal image: Bun + bundled output only

# ---------------------------------------------------------------------------
# Stage 1: dependencies
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS install
WORKDIR /app

# Copy workspace manifests only so layer caching stays effective.
COPY package.json bun.lock* bunfig.toml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/dashboard/package.json ./apps/dashboard/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# --frozen-lockfile fails the build if the committed lockfile is out of date,
# guaranteeing reproducible images.
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: build (bundle API into ./apps/api/dist)
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

COPY --from=install /app/node_modules ./node_modules
COPY package.json bunfig.toml tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared

# `--target bun` bundles the API and its workspace deps into a single JS file
# that runs natively on the Bun runtime. The dashboard is NOT included here —
# it ships separately as a static build to Vercel.
RUN bun run --filter @bench/api build

# ---------------------------------------------------------------------------
# Stage 3: runtime
# ---------------------------------------------------------------------------
FROM oven/bun:1 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Run as the non-root `bun` user shipped in the official image.
USER bun

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:3000/health'); if (!r.ok) process.exit(1)"]

CMD ["bun", "run", "dist/index.js"]
