import winston from 'winston';

import type { ServiceConfig } from '../config/types.js';

export type Logger = winston.Logger;

export function createLogger(config: ServiceConfig): Logger {
  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: { service: 'ifood-qr-service' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} [${level}] ${message}${extra}`;
          }),
        ),
      }),
      new winston.transports.File({
        filename: `${config.logPath}/service.log`,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 5,
      }),
    ],
  });
}
