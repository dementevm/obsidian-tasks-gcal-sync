import { LogUtils } from './logUtils';

type RetryableError = {
    status?: number;
    code?: string;
    message?: string;
};

interface RetryOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: unknown) => boolean;
}

const toRetryableError = (error: unknown): RetryableError =>
    typeof error === 'object' && error !== null
        ? error as RetryableError
        : {};

const defaultOptions: Required<RetryOptions> = {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    shouldRetry: (error: unknown) => {
        const info = toRetryableError(error);

        if (info.status !== undefined) {
            return info.status === 429 || info.status >= 500;
        }

        const message = info.message?.toLowerCase() ?? '';
        return message.includes('network') ||
            message.includes('timeout') ||
            info.code === 'ECONNRESET';
    },
};

export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const config = { ...defaultOptions, ...options };
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
                `Operation failed (attempt ${attempt}/${config.maxAttempts}); retrying in ${delay}ms`,
            );

            await new Promise(resolve => window.setTimeout(resolve, delay));
            delay = Math.min(delay * config.backoffFactor, config.maxDelay);
            attempt += 1;
        }
    }
}
