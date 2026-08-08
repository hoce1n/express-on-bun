import { createApp } from './app';
import { env } from './config/env';

/**
 * Process entrypoint for the API. Binds the HTTP server and wires graceful
 * shutdown so SIGTERM/SIGINT (e.g. from Docker/Kubernetes) drain in-flight
 * requests before exiting.
 */
const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(
    `[api] listening on http://${env.HOST}:${env.PORT} ` +
      `(bun ${process.versions.bun}, node ${process.versions.node})`,
  );
});

function shutdown(signal: string): void {
  console.log(`[api] received ${signal}, shutting down gracefully`);
  server.close(() => {
    console.log('[api] closed, bye');
    process.exit(0);
  });
  // Hard-exit fallback if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { server };
