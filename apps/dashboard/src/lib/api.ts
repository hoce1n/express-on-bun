import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  BenchmarkRequest,
  BenchmarkResult,
  SystemInfo,
} from '@bench/shared';

/**
 * API client for the Bun Benchmark Platform backend.
 *
 * The base URL is injected via VITE_API_BASE_URL at build time and defaults
 * to "/api" so the local Vite proxy (apps/dashboard/vite.config.ts) and the
 * Vercel SPA rewrite (apps/dashboard/vercel.json) both work with zero config.
 *
 * Every backend endpoint returns an ApiSuccessResponse envelope; every
 * failure returns a structured { error } envelope. Errors are normalized
 * into ApiError so the UI can show stable codes (MALFORMED_JSON, INVALID_REGEX,
 * REGEX_TIMEOUT, ...).
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Benchmarking-related response headers surfaced by the metrics middleware. */
export const BENCH_HEADER_NAMES = [
  'x-bench-duration-ns',
  'x-bench-heap-delta-bytes',
] as const;

export type BenchmarkHeaderMap = Record<string, string>;

export interface ApiErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface BenchmarkRunResponse {
  result: BenchmarkResult;
  meta: ApiSuccessResponse<BenchmarkResult>['meta'];
  headers: BenchmarkHeaderMap;
}

interface RequestResult<T> {
  data: T;
  meta?: ApiSuccessResponse<T>['meta'];
  headers: BenchmarkHeaderMap;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<RequestResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', 'API unreachable', {
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const headers: BenchmarkHeaderMap = {};
  for (const name of BENCH_HEADER_NAMES) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }

  const isErrorEnvelope =
    typeof body === 'object' &&
    body !== null &&
    'error' in (body as Record<string, unknown>);

  if (!response.ok || isErrorEnvelope) {
    const error = (body as ApiErrorResponse | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  const payload = body as ApiSuccessResponse<T>;
  return { data: payload.data, meta: payload.meta, headers };
}

/** Run a benchmark and surface its result plus HTTP trace headers. */
export async function runBenchmark(
  request: BenchmarkRequest,
): Promise<BenchmarkRunResponse> {
  const endpoint = request.type === 'json_parse' ? 'json-parse' : 'regex-match';
  const { data, meta, headers } = await requestJson<BenchmarkResult>(
    `/v1/benchmarks/${endpoint}`,
    {
      method: 'POST',
      body: JSON.stringify(request),
    },
  );
  return { result: data, meta: meta!, headers };
}

/** Fetch runtime/system context used to normalize results across machines. */
export async function fetchSystemInfo(): Promise<SystemInfo> {
  const { data } = await requestJson<SystemInfo>('/v1/benchmarks/system-info');
  return data;
}

/** Liveness probe. */
export async function fetchHealth(): Promise<void> {
  await requestJson<unknown>('/health');
}
