import pino from 'pino';
import { config } from '../config';

const isProduction = config.NODE_ENV === 'production';

export const logger = pino({
    level: config.LOG_LEVEL,
    transport: isProduction ? undefined : {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
        }
    },
    base: {
        service: 'miko-keeper-bot',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
    },
});

// Create child loggers for different components
export const createLogger = (component: string) => {
    return logger.child({ component });
};