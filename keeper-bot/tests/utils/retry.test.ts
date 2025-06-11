import { withRetry, createRetryableFunction } from '../../src/utils/retry';

describe('Retry Utils', () => {
    describe('withRetry', () => {
        it('should succeed on first attempt', async () => {
            const fn = jest.fn().mockResolvedValue('success');
            
            const result = await withRetry(fn);
            
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });
        
        it('should retry on failure and eventually succeed', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValue('success');
            
            const result = await withRetry(fn, { maxRetries: 3, delay: 10 });
            
            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(3);
        });
        
        it('should throw after max retries', async () => {
            const error = new Error('Always fails');
            const fn = jest.fn().mockRejectedValue(error);
            
            await expect(
                withRetry(fn, { maxRetries: 2, delay: 10 })
            ).rejects.toThrow('Always fails');
            
            expect(fn).toHaveBeenCalledTimes(2);
        });
        
        it('should call onRetry callback', async () => {
            const onRetry = jest.fn();
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail'))
                .mockResolvedValue('success');
            
            await withRetry(fn, { maxRetries: 2, delay: 10, onRetry });
            
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
        });
        
        it('should apply exponential backoff', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValue('success');
            
            const startTime = Date.now();
            
            await withRetry(fn, { 
                maxRetries: 3, 
                delay: 100, 
                backoff: 2 
            });
            
            const elapsed = Date.now() - startTime;
            
            // Should wait at least 100ms + 200ms = 300ms
            expect(elapsed).toBeGreaterThanOrEqual(300);
        });
    });
    
    describe('createRetryableFunction', () => {
        it('should create a retryable version of a function', async () => {
            const originalFn = jest.fn()
                .mockRejectedValueOnce(new Error('Fail'))
                .mockResolvedValue('success');
            
            const retryableFn = createRetryableFunction(originalFn, {
                maxRetries: 2,
                delay: 10,
            });
            
            const result = await retryableFn();
            
            expect(result).toBe('success');
            expect(originalFn).toHaveBeenCalledTimes(2);
        });
        
        it('should pass arguments correctly', async () => {
            const originalFn = jest.fn((a: number, b: string) => 
                Promise.resolve(`${a}-${b}`)
            );
            
            const retryableFn = createRetryableFunction(originalFn);
            
            const result = await retryableFn(42, 'test');
            
            expect(result).toBe('42-test');
            expect(originalFn).toHaveBeenCalledWith(42, 'test');
        });
    });
});