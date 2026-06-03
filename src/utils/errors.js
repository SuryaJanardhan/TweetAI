export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code, message, details = undefined) {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(401, 'unauthorized', message);
}

export function forbidden(requiredRole) {
  return new AppError(403, 'forbidden', 'Insufficient permissions', { requiredRole });
}
