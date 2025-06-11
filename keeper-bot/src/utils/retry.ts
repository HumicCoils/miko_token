import { createLogger } from './logger';

const logger = createLogger('retry');

export interface RetryOptions {
    maxRetries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        delay = 1000,
        backoff = 2,
        onRetry
    } = options;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            
            if (attempt === maxRetries) {
                logger.error({ error: lastError, attempts: maxRetries }, 'Max retries reached');
                throw lastError;
            }
            
            const waitTime = delay * Math.pow(backoff, attempt - 1);
            
            logger.warn({
                error: lastError,
                attempt,
                maxRetries,
                waitTime
            }, 'Operation failed, retrying...');
            
            if (onRetry) {
                onRetry(lastError, attempt);
            }
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
    
    throw new Error('Unreachable');
}

export function createRetryableFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    defaultOptions: RetryOptions = {}
): T {
    return (async (...args: Parameters<T>) => {
        return withRetry(() => fn(...args), defaultOptions);
    }) as T;
}