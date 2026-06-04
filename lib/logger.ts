/**
 * Structured logging with Pino.
 *
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const log = createLogger('detection-engine');
 *   log.info({ alarmCode: 'NMS_PORT_DOWN' }, 'Alarm triggered');
 *   log.error({ err, deviceId }, 'Poll failed');
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

function createLogger(component: string) {
  return pino({
    name: component,
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    // Avoid pino-pretty transport in dev — it spawns worker threads
    // that are incompatible with Turbopack's module resolution.
    // In production, use JSON output.
    ...(isDev
      ? {}
      : {
          formatters: {
            level(label) {
              return { level: label };
            },
          },
        }),
  });
}

export { createLogger };
