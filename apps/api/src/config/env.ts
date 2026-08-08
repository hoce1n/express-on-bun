import { z } from 'zod';

/**
 * Centralized, validated runtime configuration for the API.
 *
 * Every value is parsed through zod on import so a typo or an invalid value
 * fails fast with a clear message instead of producing a half-broken server.
 * In production the same schema is enforced, only the defaults change.
 */

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_BODY_MB: z.coerce.number().int().min(1).max(64).default(20),
  TRUST_PROXY: z.string().default('loopback'),
  // Benchmark engine guards — bound the worst-case work per request.
  /** Hard timeout (ms) for regex execution; a worker is terminated on expiry. */
  REGEX_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
  /** Upper bound on benchmark iterations. */
  BENCH_MAX_ITERATIONS: z.coerce.number().int().min(1).max(100_000).default(100),
  /** Upper bound (chars) on the regex_match source text buffer. */
  BENCH_MAX_TEXT_CHARS: z.coerce
    .number()
    .int()
    .min(1024)
    .max(512 * 1024 * 1024)
    .default(16 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse an environment-shaped record. Kept separate from the cached `env`
 * export so tests can inject arbitrary values.
 */
export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    console.error(
      '[config] Invalid environment configuration',
      JSON.stringify(result.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }
  return result.data;
}

/** Lazily-parsed singleton used across the application. */
export const env: Env = loadEnv();
