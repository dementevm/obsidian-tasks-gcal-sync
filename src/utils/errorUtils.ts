import { ERROR_MESSAGES } from '../config/constants';

type ErrorMetadata = Error & {
    status?: number;
    code?: string;
    response?: string;
};

export class ErrorUtils {
    private static getMetadata(error: unknown): {
        status?: number;
        code?: string;
        response?: string;
    } {
        if (typeof error !== 'object' || error === null) return {};

        const candidate = error as {
            status?: unknown;
            code?: unknown;
            response?: unknown;
        };

        return {
            status: typeof candidate.status === 'number' ? candidate.status : undefined,
            code: typeof candidate.code === 'string' ? candidate.code : undefined,
            response: typeof candidate.response === 'string' ? candidate.response : undefined,
        };
    }

    private static copyMetadata(target: Error, source: unknown): ErrorMetadata {
        const metadata = this.getMetadata(source);
        const result = target as ErrorMetadata;

        if (metadata.status !== undefined) result.status = metadata.status;
        if (metadata.code !== undefined) result.code = metadata.code;
        if (metadata.response !== undefined) result.response = metadata.response;

        return result;
    }

    static isEventGoneError(error: unknown): boolean {
        const { status } = this.getMetadata(error);
        if (status === 404 || status === 410) return true;

        const message = error instanceof Error ? error.message : String(error);
        return message.includes('Event not found') ||
            message.includes('Event already deleted') ||
            message.includes('status 404') ||
            message.includes('status 410');
    }

    static isNetworkError(error: unknown): boolean {
        const { code } = this.getMetadata(error);
        const message = error instanceof Error ? error.message : String(error);

        return code === 'ECONNRESET' ||
            /network|timeout|timed out|fetch failed/i.test(message);
    }

    static isRetryableError(error: unknown): boolean {
        const { status } = this.getMetadata(error);
        return status === 429 ||
            (status !== undefined && status >= 500) ||
            (status === undefined && this.isNetworkError(error));
    }

    static formatError(error: unknown): string {
        if (error instanceof Error) {
            return `${error.name}: ${error.message}`;
        }
        return String(error);
    }

    static createError(
        type: keyof typeof ERROR_MESSAGES,
        details?: string,
        source?: unknown,
    ): ErrorMetadata {
        const base = ERROR_MESSAGES[type];
        const error = new Error(details ? `${base}: ${details}` : base);
        return this.copyMetadata(error, source);
    }

    static handleCommonErrors(error: unknown): Error {
        const { status } = this.getMetadata(error);

        if (status === 401) return this.createError('AUTH_REQUIRED', undefined, error);
        if (status === 403) return this.createError('AUTH_FAILED', undefined, error);
        if (status === 429) return this.createError('RATE_LIMIT', undefined, error);
        if (status === 410) return this.createError('EVENT_ALREADY_DELETED', undefined, error);
        if (status === 404) return this.createError('EVENT_NOT_FOUND', undefined, error);

        if (this.isNetworkError(error)) {
            const details = error instanceof Error ? error.message : String(error);
            return this.createError('NETWORK_ERROR', details, error);
        }

        return error instanceof Error ? error : new Error(String(error));
    }
}
