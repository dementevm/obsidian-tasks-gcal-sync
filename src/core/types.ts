import { TFile } from 'obsidian';
import type { Credentials, OAuth2Client } from 'google-auth-library';
import "obsidian";

declare module "obsidian" {
    interface App {
        unregisterProtocolHandler?: (protocol: string) => void;
        plugins: {
            plugins: {
                [key: string]: any;
            };
        };
        commands: {
            commands: {
                [key: string]: any;
            };
            removeCommand: (commandId: string) => void;
        };
    }
}

export interface Task {
    id: string;
    title: string;
    date: string;
    eventId?: string;
    time?: string;
    endTime?: string;
    durationMinutes?: number;
    reminder?: number;
    kind?: 'task' | 'event';
    completed: boolean;
    completedDate?: string;
    createdAt: number;
    filePath?: string;
}

export interface TaskMetadata {
    filePath?: string;
    eventId?: string;
    title: string;
    date: string;
    time?: string;
    endTime?: string;
    durationMinutes?: number;
    reminder?: number;
    kind?: 'task' | 'event';
    completed: boolean;
    completedDate?: string;
    createdAt: number;
    lastModified: number;
    lastSynced: number;
    version?: number;               // Explicit version counter for tracking changes
    syncOperationId?: string;       // Operation ID for tracing sync operations
    justSynced?: boolean;           // Flag to prevent double-syncing during rapid edits
    syncTimestamp?: number;         // When the sync actually occurred
    conflicts?: string[];
    conflictResolution?: {
        timestamp: number;
        fields: string[];
        resolution: 'auto' | 'manual';
    };
}

export interface GoogleCalendarSettings {
    clientId: string;
    /**
     * Legacy plaintext client secret. Kept only for one-time migration to SecretStorage.
     */
    clientSecret?: string;
    /** SecretStorage entry name containing the Google OAuth client secret. */
    clientSecretName: string;
    /** HTTPS OAuth redirect bridge URL configured in Google Cloud. */
    oauthRedirectUri: string;
    oauth2Tokens?: OAuth2Tokens;
    encryptedOAuth2Tokens?: string; // Encrypted tokens (replaces oauth2Tokens when encrypted)
    tokensEncrypted?: boolean; // Flag indicating tokens are stored encrypted
    syncEnabled: boolean;
    calendarId: string;
    defaultReminder: number;
    defaultEventDurationMinutes: number;
    defaultMorningEventTime: string;
    includeFolders: string[];
    taskMetadata: Record<string, TaskMetadata>;
    taskIds: Record<string, string>;
    verboseLogging: boolean;
    hasCompletedOnboarding?: boolean;
    mobileSyncLimit?: number; // Limit number of files to search on mobile (default: 100)
    mobileOptimizations?: boolean; // Enable mobile-specific optimizations (default: true)
    settingsSchemaVersion?: number;
}

export interface Pos {
    start: number;
    end: number;
}

export interface TaskCache {
    task: string;
    position: Pos;
    parent?: number;
}

export interface OAuth2Tokens {
    access_token: string;
    refresh_token?: string;
    scope: string;
    token_type: string;
    expiry_date: number;
    stored_at?: number; // When the tokens were stored
}

export interface FileChangeEvent {
    type: 'create' | 'modify' | 'delete';
    file: TFile;
}

export interface CacheChangeEvent {
    type: 'resolve' | 'change';
    file?: TFile;
}

export interface GoogleAuthManagerInterface {
    getOAuth2Client(): OAuth2Client;
    startAuthFlow(): Promise<void>;
    refreshTokens(tokens: Credentials): Promise<Credentials>;
    revokeTokens(tokens: Credentials): Promise<void>;
    onunload(): Promise<void>;
}

// Constants for task versioning and validation
export const CURRENT_TASK_VERSION = 1;
export const GCAL_SYNC_TAG_REGEX = /\^gcal-([a-f0-9-]+)-([a-f0-9]{8})/;

export interface TaskIdMapping {
    id: string;
    from: number;
    to: number;
}

/**
 * Interface for parsed task data before full validation
 * Used in taskParser.ts for validating task data structure
 */
export interface ParsedTaskData {
    date?: string;
    time?: string;
    endTime?: string;
    durationMinutes?: number;
    reminder?: number;
}

/**
 * Interface for API error responses with status information
 * Used for proper error handling in calendarSync.ts
 */
export interface ApiError extends Error {
    status?: number;
    response?: string;
}