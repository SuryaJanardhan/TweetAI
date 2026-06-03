import type { Role } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      idempotencyKey?: string;
      user?: {
        role: Role;
        authMode: 'api-key' | 'disabled';
      };
    }
  }
}

export {};
