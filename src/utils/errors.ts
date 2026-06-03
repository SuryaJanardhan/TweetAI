type ErrorDetails = Record<string, unknown> | undefined;

export class AppError extends Error {
  statusCode: number;
  code: string;
  details: ErrorDetails;

  constructor(statusCode: number, code: string, message: string, details: ErrorDetails = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details: ErrorDetails = undefined): AppError {
  return new AppError(400, code, message, details);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'unauthorized', message);
}

export function forbidden(requiredRole: string): AppError {
  return new AppError(403, 'forbidden', 'Insufficient permissions', { requiredRole });
}
