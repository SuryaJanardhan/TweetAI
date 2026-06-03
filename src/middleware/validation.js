import { badRequest } from '../utils/errors.js';

const MEMORY_TYPES = new Set(['working', 'episodic', 'semantic', 'performance', 'strategic']);

export function requireMemoryType(req, _res, next) {
  if (!MEMORY_TYPES.has(req.params.type)) {
    return next(
      badRequest('invalid_memory_type', `Unsupported memory type: ${req.params.type}`, {
        supported: [...MEMORY_TYPES]
      })
    );
  }
  return next();
}

export function requireObjectBody(req, _res, next) {
  if (!req.is('application/json')) {
    return next(badRequest('invalid_content_type', 'Content-Type must be application/json'));
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return next(badRequest('invalid_body', 'Request body must be a JSON object'));
  }

  return next();
}

export function requireNonEmptyObjectBody(req, res, next) {
  requireObjectBody(req, res, (error) => {
    if (error) {
      return next(error);
    }
    if (Object.keys(req.body).length === 0) {
      return next(badRequest('empty_body', 'Request body must include at least one field'));
    }
    return next();
  });
}

export function optionalIdempotencyKey(req, _res, next) {
  const value = req.header('idempotency-key');
  if (!value) {
    return next();
  }

  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    return next(
      badRequest(
        'invalid_idempotency_key',
        'Idempotency-Key must be 8-128 characters and contain only letters, numbers, dot, underscore, colon, or dash'
      )
    );
  }

  req.idempotencyKey = value;
  return next();
}
