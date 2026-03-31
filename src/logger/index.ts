import pino, { type Logger } from 'pino';

import type { EnvConfig } from '../types';

export function buildLogger(options: EnvConfig): Logger {
  return pino({
    level: options.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-api-key',
        'req.headers.proxy-authorization',
        'req.body.password',
        'req.body.token',
        'req.body.secret',
        'err.config.headers.Authorization',
        'err.config.headers.authorization',
        'databaseUrl',
        'redisUrl'
      ],
      censor: '[REDACTED]'
    },
    base: {
      service: 'feriados-producer'
    }
  });
}
