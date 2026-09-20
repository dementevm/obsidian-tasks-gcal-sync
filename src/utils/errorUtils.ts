import { ERROR_MESSAGES } from '../config/constants';

type ErrorLike = {
    message?: string;
    status?: number;
    code?: string;
};

export class ErrorUtils {
    private static toErrorLike(error: unknown): ErrorLike {
        return typeof error === 'object' && error !== null
            ? error as ErrorLike
            : {};
    }

    static isEventGoneError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;

        return error.message.includes('status 404') ||
            error.message.includes('status 410') ||
            error.message.includes('Event already deleted');
    }

    private static isNetworkError(error: unknown): boolean {
        const info = this.toErrorLike(error);
        return info.message?.toLowerCase().includes('network') === true ||
            info.message?.toLowerCase().includes('timeout') === true ||
            info.code === 'ECONNRESET';
    }

    private static createError(type: keyof typeof ERROR_MESSAGES, details?: string): Error {
        const message = details
            ? `${ERROR_MESSAGES[type]}: ${details}`
            : ERROR_MESSAGES[type];

        return new Error(message);
    }

    static handleCommonErrors(error: unknown): Error {
        const info = this.toErrorLike(error);

        if (info.status === 401) return this.createError('AUTH_REQUIRED');
        if (info.status === 403) return this.createError('AUTH_FAILED');
        if (info.status === 429) return this.createError('RATE_LIMIT');
        if (info.status === 410) return this.createError('EVENT_ALREADY_DELETED');
        if (info.status === 404) return this.createError('EVENT_NOT_FOUND');

        if (this.isNetworkError(error)) {
            return this.createError('NETWORK_ERROR', info.message);
        }

        return error instanceof Error ? error : new Error(String(error));
    }
}
