import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { getMemoryStats } from '../lib/memory';
import { nsToMs } from '../lib/timing';

/**
 * Error with an explicit HTTP status, thrown by application code.
 * Thrown/returned from an async handler, Express 5 forwards it to the
 * global error handler automatically.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Response helper for request validation failures (400). */
export class ValidationError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Terminal error handler. Must keep the exact 4-arg signature so Express
 * recognizes it as an error handler. Never throws here — the goal is that
 * malformed input produces a clean JSON envelope, never a crash.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const status = resolveStatus(err);

  const isServerError = status >= 500;

  if (isServerError) {
    console.error('[api] unhandled error', err);
  }

  res.status(status).json({
    error: {
      message: isServerError ? 'Internal server error' : messageOf(err),
      details: err instanceof HttpError ? err.details : undefined,
      stack:
        env.NODE_ENV !== 'production' && err instanceof Error
          ? err.stack
          : undefined,
    },
  });
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Resolve an HTTP status for an arbitrary thrown error:
 *   1. explicit HttpError status,
 *   2. numeric `status`/`statusCode` (body-parser payload/parse errors, etc.),
 *   3. malformed JSON body from express.json() -> SyntaxError (400),
 *   4. anything else -> 500.
 */
function resolveStatus(err: unknown): number {
  if (err instanceof HttpError) return err.status;

  const candidate = (err as { status?: unknown; statusCode?: unknown })?.status;
  if (typeof candidate === 'number' && candidate >= 400 && candidate <= 599) {
    return candidate;
  }

  const code = (err as { statusCode?: unknown })?.statusCode;
  if (typeof code === 'number' && code >= 400 && code <= 599) {
    return code;
  }

  if (err instanceof SyntaxError) return 400;
  return 500;
}
