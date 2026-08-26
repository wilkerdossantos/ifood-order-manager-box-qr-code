import winston from 'winston';

import type { ServiceConfig } from '../config/types.js';

export type Logger = winston.Logger;

export function createLogger(config: ServiceConfig): Logger {
  const activityFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const tag = String(message);
    if (tag.startsWith('[')) {
      const extra = Object.keys(meta).length
        ? ' ' + Object.entries(meta)
            .filter(([k]) => k !== 'service')
            .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' ')
        : '';
      return `${timestamp} ${level}: ${message}${extra}`;
    }
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${extra}`;
  });

  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
    ),
    defaultMeta: { service: 'ifood-qr-service' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), activityFormat),
      }),
      new winston.transports.File({
        filename: `${config.logPath}/service.log`,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
        format: winston.format.combine(winston.format.json()),
      }),
      new winston.transports.File({
        filename: `${config.logPath}/activity.log`,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3,
        format: winston.format.combine(activityFormat),
      }),
    ],
  });
}
