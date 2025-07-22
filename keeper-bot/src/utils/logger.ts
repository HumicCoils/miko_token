import winston from 'winston';
import path from 'path';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // File transport
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'keeper-bot.log'),
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 5,
      tailable: true
    }),
    // Error file transport
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'error.log'),
      level: 'error',
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 5
    })
  ]
});

// Create a child logger factory
export const createLogger = (module: string) => {
  return logger.child({ module });
};

export default logger;