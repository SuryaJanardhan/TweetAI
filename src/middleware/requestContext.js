import crypto from 'node:crypto';

export function assignRequestContext(req, res, next) {
  const requestId = req.header('x-request-id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
