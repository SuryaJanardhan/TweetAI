import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function assignRequestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
