import crypto from 'node:crypto';
import { forbidden, unauthorized } from '../utils/errors.js';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function authenticateApiKey(config) {
  return (req, res, next) => {
    if (!config.auth.required) {
      req.user = { role: 'admin', authMode: 'disabled' };
      return next();
    }

    const header = req.header('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const match = config.auth.apiKeys.find((apiKey) => safeEqual(apiKey.token, token));

    if (!match) {
      return next(unauthorized());
    }

    req.user = { role: match.role, authMode: 'api-key' };
    next();
  };
}

export function requireRole(role) {
  return (req, _res, next) => {
    const userRole = req.user?.role;
    if (userRole !== role && userRole !== 'admin') {
      return next(forbidden(role));
    }
    return next();
  };
}
