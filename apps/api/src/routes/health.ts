import { Router } from 'express';

/**
 * Liveness endpoint. Used by the Docker HEALTHCHECK, orchestrators, and the
 * dashboard to confirm the API process is up.
 */
export const healthRouter: Router = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: '@bench/api',
    runtime: {
      bun: process.versions.bun,
      node: process.versions.node,
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
