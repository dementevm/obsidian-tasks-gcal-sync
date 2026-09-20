export const TIMING = {
    FILE_CHANGE_DEBOUNCE_MS: 1000,
    EDITOR_CHANGE_DEBOUNCE_MS: 200,

    JUST_SYNCED_WINDOW_MS: 2000,
    JUST_SYNCED_FLAG_CLEAR_MS: 3500,

    LOCK_TIMEOUT_MS: 30000,

    PERIODIC_STATE_CLEANUP_INTERVAL_MS: 5 * 60 * 1000,

    SYNC_QUEUE_CHECK_INTERVAL_MS: 500,
    SYNC_QUEUE_SAFETY_TIMEOUT_MS: 10000,
} as const;

export const ERROR_MESSAGES = {
    AUTH_REQUIRED: 'Authentication required',
    AUTH_FAILED: 'Authentication failed',
    NETWORK_ERROR: 'Network error',
    RATE_LIMIT: 'Rate limit exceeded',
    EVENT_NOT_FOUND: 'Event not found',
    EVENT_ALREADY_DELETED: 'Event already deleted',
} as const;

export const LOG_LEVELS = {
    DEBUG: '🔍',
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    SUCCESS: '✅',
} as const;
