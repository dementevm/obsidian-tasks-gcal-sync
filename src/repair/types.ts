import type { Task, TaskMetadata } from '../core/types';

export interface GoogleCalendarEvent {
    id: string;
    summary: string;
    description?: string;
    start: {
        date?: string;
        dateTime?: string;
    };
    end: {
        date?: string;
        dateTime?: string;
    };
    created: string;
    updated?: string;
    extendedProperties?: {
        private?: {
            obsidianTaskId?: string;
            isObsidianTask?: string;
            version?: string;
        };
    };
    reminders?: {
        useDefault: boolean;
        overrides?: Array<{
            method: string;
            minutes: number;
        }>;
    };
}

export type RepairPhase = 'init' | 'analysis' | 'delete' | 'update' | 'create' | 'metadata' | 'complete';

export interface RepairProgress {
    phase: RepairPhase;
    totalItems: number;
    processedItems: number;
    currentOperation: string;
    estimatedTimeRemaining?: number;
    failedItems: string[];
    retryCount: number;
    currentBatch: number;
    errors: Array<{ id: string; error: string }>;
}

export const RepairOperations = {
    INIT: 'Initializing repair',
    ANALYSIS: 'Analyzing tasks',
    CLEANUP_EVENTS: 'Cleaning up orphaned events',
    CLEANUP_METADATA: 'Cleaning up orphaned metadata',
    UPDATE: 'Updating events',
    CREATE: 'Creating events',
    COMPLETE: 'Completing repair'
} as const;


export interface RepairResult {
    success: boolean;
    processedCount: number;
    errors: Map<string, Error>;
    skippedTasks: Set<string>;
    timestamp: number;
    duration: number;
}

export class RepairError extends Error {
    constructor(
        message: string,
        public readonly taskId?: string,
        public readonly eventId?: string,
        public readonly phase?: string
    ) {
        super(message);
        this.name = 'RepairError';
    }
}

export class TaskLockedError extends RepairError {
    constructor(taskId: string) {
        super(`Task ${taskId} is locked`, taskId);
        this.name = 'TaskLockedError';
    }
}

export class CatastrophicError extends RepairError {
    constructor(message: string, phase: string) {
        super(message, undefined, undefined, phase);
        this.name = 'CatastrophicError';
    }
}

export const RepairPhases: Record<RepairPhase, RepairPhase> = {
    init: 'init',
    analysis: 'analysis',
    delete: 'delete',
    update: 'update',
    create: 'create',
    metadata: 'metadata',
    complete: 'complete'
} as const; 