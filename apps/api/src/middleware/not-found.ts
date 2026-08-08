import type { Request, Response } from 'express';

/** 404 for any route that is not registered. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { message: 'Not found' } });
}
