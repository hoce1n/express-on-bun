import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { metricsMiddleware } from './middleware/metrics';
import { notFoundHandler } from './middleware/not-found';
import { benchmarksRouter } from './routes/benchmarks';
import { healthRouter } from './routes/health';

/**
 * Assemble the Express application. Kept separate from the entrypoint so
 * tests can build the app without opening a listening socket.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  // Security & robustness foundations.
  app.use(helmet());
  app.use(
    cors({
      // Expose benchmark trace headers to cross-origin clients (dashboard),
      // where they power the HTTP headers metric inspector.
      exposedHeaders: ['x-bench-duration-ns', 'x-bench-heap-delta-bytes'],
    }),
  );
  app.use(metricsMiddleware());

  // Bounded JSON bodies: MAX_BODY_MB caps payload size so a hostile or
  // mistaken request cannot exhaust memory before it is handled.
  app.use(express.json({ limit: `${env.MAX_BODY_MB}mb` }));

  // Routes.
  // Liveness: exposed on both /health (Docker HEALTHCHECK, orchestrators) and
  // /api/health (same origin as the dashboard's API base URL).
  app.use('/health', healthRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/v1/benchmarks', benchmarksRouter);

  // 404 + centralized error handling (must be registered last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
