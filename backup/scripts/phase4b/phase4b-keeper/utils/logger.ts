import * as fs from 'fs';
import * as path from 'path';

// Logging levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Logger configuration
interface LoggerConfig {
  level: LogLevel;
  writeToFile: boolean;
  logDir?: string;
}

// Default configuration
const defaultConfig: LoggerConfig = {
  level: LogLevel.INFO,
  writeToFile: true,
  logDir: './logs'
};

// Global configuration (can be overridden)
let globalConfig = { ...defaultConfig };

export function setLoggerConfig(config: Partial<LoggerConfig>) {
  globalConfig = { ...globalConfig, ...config };
}

export function createLogger(name: string): {
  debug: (message: string, meta?: any) => void;
  info: (message: string, meta?: any) => void;
  warn: (message: string, meta?: any) => void;
  error: (message: string, meta?: any) => void;
} {
  const logFile = globalConfig.writeToFile && globalConfig.logDir
    ? path.join(globalConfig.logDir, 'keeper-bot.log')
    : null;

  // Ensure log directory exists
  if (logFile && globalConfig.logDir) {
    if (!fs.existsSync(globalConfig.logDir)) {
      fs.mkdirSync(globalConfig.logDir, { recursive: true });
    }
  }

  function log(level: LogLevel, levelName: string, message: string, meta?: any) {
    if (level < globalConfig.level) return;

    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    const logEntry = `[${timestamp}] [${levelName}] [${name}] ${message}${metaStr}`;

    // Console output
    switch (level) {
      case LogLevel.ERROR:
        console.error(logEntry);
        break;
      case LogLevel.WARN:
        console.warn(logEntry);
        break;
      default:
        console.log(logEntry);
    }

    // File output
    if (logFile) {
      fs.appendFileSync(logFile, logEntry + '\n');
    }
  }

  return {
    debug: (message: string, meta?: any) => log(LogLevel.DEBUG, 'DEBUG', message, meta),
    info: (message: string, meta?: any) => log(LogLevel.INFO, 'INFO', message, meta),
    warn: (message: string, meta?: any) => log(LogLevel.WARN, 'WARN', message, meta),
    error: (message: string, meta?: any) => log(LogLevel.ERROR, 'ERROR', message, meta),
  };
}