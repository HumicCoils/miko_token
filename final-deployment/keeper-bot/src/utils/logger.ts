import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';
import * as fs from 'fs';

export class Logger {
  private logger: winston.Logger;
  private static loggers: Map<string, winston.Logger> = new Map();
  
  constructor(module: string) {
    // Check if logger already exists for this module
    const existing = Logger.loggers.get(module);
    if (existing) {
      this.logger = existing;
      return;
    }
    
    // Load config
    const configPath = path.join(__dirname, '..', '..', 'config', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // Create logs directory
    const logsDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Create transports
    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${module}] ${level}: ${message} ${metaStr}`;
          })
        )
      }),
      
      // Daily rotate file transport
      new DailyRotateFile({
        filename: path.join(logsDir, 'keeper-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: config.log.max_files || '30d',
        maxSize: config.log.max_size || '20m',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      
      // Error file transport
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    ];
    
    // Create logger
    this.logger = winston.createLogger({
      level: config.log.level || 'info',
      defaultMeta: { module },
      transports
    });
    
    // Store logger for reuse
    Logger.loggers.set(module, this.logger);
  }
  
  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }
  
  warn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }
  
  error(message: string, meta?: any) {
    this.logger.error(message, meta);
  }
  
  debug(message: string, meta?: any) {
    this.logger.debug(message, meta);
  }
  
  // Performance logging
  startTimer(): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      return duration;
    };
  }
  
  // Structured logging for important events
  logEvent(event: string, data: any) {
    this.logger.info(`EVENT: ${event}`, {
      event,
      data,
      timestamp: new Date().toISOString()
    });
  }
  
  // Metric logging
  logMetric(metric: string, value: number, tags?: Record<string, string>) {
    this.logger.info(`METRIC: ${metric}`, {
      metric,
      value,
      tags,
      timestamp: new Date().toISOString()
    });
  }
}