import { ErrorUtils } from './errorUtils';
import { LogUtils } from './logUtils';

export interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30_000,
    backoffFactor: 2,
    shouldRetry: (error: unknown) => ErrorUtils.isRetryableError(error),
};

const sleep = (delayMs: number): Promise<void> =>
    new Promise(resolve => window.setTimeout(resolve, delayMs));

export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const config = {
        ...DEFAULT_OPTIONS,
        ...options,
        shouldRetry: options.shouldRetry ?? DEFAULT_OPTIONS.shouldRetry,
    };

    let attempt = 1;
    let delay = config.initialDelay;

    while (true) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= config.maxAttempts || !config.shouldRetry(error)) {
                throw error;
            }

            LogUtils.warn(
                `Operation failed (attempt ${attempt}/${config.maxAttempts}); ` +
                `retrying in ${delay}ms: ${ErrorUtils.formatError(error)}`,
            );

            await sleep(delay);
            delay = Math.min(delay * config.backoffFactor, config.maxDelay);
            attempt += 1;
        }
    }
}

export function isRetryableError(error: unknown): boolean {
    return DEFAULT_OPTIONS.shouldRetry(error);
}
