import type { GoogleCalendarSettings } from '../core/types';

const CANONICAL_REDIRECT_URI = 'https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/';

export interface ShareableCalendarSetup {
    version: 2;
    clientId: string;
    calendarId: string;
    scanEntireVault: boolean;
    includeFolders: string[];
    defaultTimedTaskReminderMinutes: number;
    defaultInformationalEventReminderMinutes: number;
    allDayTaskRemindersEnabled: boolean;
    defaultAllDayTaskReminderMinutes: number;
    defaultEventDurationMinutes: number;
    defaultMorningEventTime: string;
    mobileOptimizations: boolean;
    mobileSyncLimit: number;
}

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 16_384) {
        throw new Error('Invalid setup link payload.');
    }

    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

export function createShareableSetup(settings: GoogleCalendarSettings): ShareableCalendarSetup {
    return {
        version: 2,
        clientId: settings.clientId,
        calendarId: settings.calendarId,
        scanEntireVault: settings.scanEntireVault,
        includeFolders: [...settings.includeFolders],
        defaultTimedTaskReminderMinutes: settings.defaultTimedTaskReminderMinutes,
        defaultInformationalEventReminderMinutes: settings.defaultInformationalEventReminderMinutes,
        allDayTaskRemindersEnabled: settings.allDayTaskRemindersEnabled,
        defaultAllDayTaskReminderMinutes: settings.defaultAllDayTaskReminderMinutes,
        defaultEventDurationMinutes: settings.defaultEventDurationMinutes,
        defaultMorningEventTime: settings.defaultMorningEventTime,
        mobileOptimizations: settings.mobileOptimizations ?? true,
        mobileSyncLimit: settings.mobileSyncLimit ?? 100
    };
}

export function encodeSetup(settings: GoogleCalendarSettings): string {
    const json = JSON.stringify(createShareableSetup(settings));
    return bytesToBase64Url(new TextEncoder().encode(json));
}

function validFiniteNumber(value: unknown, min: number, max: number): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function decodeSetup(encoded: string): ShareableCalendarSetup {
    const json = new TextDecoder().decode(base64UrlToBytes(encoded));
    const parsed = JSON.parse(json) as Partial<ShareableCalendarSetup> & {
        version?: number;
        oauthRedirectUri?: string; // ignored legacy v1 field
    };

    if (parsed.version !== 1 && parsed.version !== 2) {
        throw new Error('Unsupported setup-link version.');
    }
    if (typeof parsed.clientId !== 'string' || parsed.clientId.length > 512) {
        throw new Error('Invalid setup link: clientId.');
    }
    if (typeof parsed.calendarId !== 'string' || parsed.calendarId.length > 1024) {
        throw new Error('Invalid setup link: calendar ID.');
    }
    if (typeof parsed.scanEntireVault !== 'boolean') {
        throw new Error('Invalid setup link: sync scope.');
    }
    if (!Array.isArray(parsed.includeFolders) ||
        parsed.includeFolders.length > 500 ||
        parsed.includeFolders.some(folder => typeof folder !== 'string' || folder.length > 1024)) {
        throw new Error('Invalid setup link: folders.');
    }
    if (!validFiniteNumber(parsed.defaultTimedTaskReminderMinutes, 0, 40320) ||
        !validFiniteNumber(parsed.defaultInformationalEventReminderMinutes, 0, 40320) ||
        typeof parsed.allDayTaskRemindersEnabled !== 'boolean' ||
        !validFiniteNumber(parsed.defaultAllDayTaskReminderMinutes, 0, 40320) ||
        !validFiniteNumber(parsed.defaultEventDurationMinutes, 1, 1440) ||
        typeof parsed.defaultMorningEventTime !== 'string' ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(parsed.defaultMorningEventTime) ||
        typeof parsed.mobileOptimizations !== 'boolean' ||
        !validFiniteNumber(parsed.mobileSyncLimit, 1, 10000)) {
        throw new Error('Invalid setup link: settings values.');
    }

    return {
        version: 2,
        clientId: parsed.clientId,
        calendarId: parsed.calendarId,
        scanEntireVault: parsed.scanEntireVault,
        includeFolders: [...parsed.includeFolders],
        defaultTimedTaskReminderMinutes: parsed.defaultTimedTaskReminderMinutes,
        defaultInformationalEventReminderMinutes: parsed.defaultInformationalEventReminderMinutes,
        allDayTaskRemindersEnabled: parsed.allDayTaskRemindersEnabled,
        defaultAllDayTaskReminderMinutes: parsed.defaultAllDayTaskReminderMinutes,
        defaultEventDurationMinutes: parsed.defaultEventDurationMinutes,
        defaultMorningEventTime: parsed.defaultMorningEventTime,
        mobileOptimizations: parsed.mobileOptimizations,
        mobileSyncLimit: parsed.mobileSyncLimit
    };
}

export function createSetupLink(settings: GoogleCalendarSettings): string {
    const data = encodeURIComponent(encodeSetup(settings));
    return `obsidian://tasks-gcal-sync/setup?data=${data}`;
}

export function applyShareableSetup(
    settings: GoogleCalendarSettings,
    setup: ShareableCalendarSetup
): GoogleCalendarSettings {
    return {
        ...settings,
        clientId: setup.clientId,
        // Redirect bridge is security-sensitive and never imported from a link.
        oauthRedirectUri: CANONICAL_REDIRECT_URI,
        calendarId: setup.calendarId,
        primaryCalendarConfirmed: false,
        scanEntireVault: setup.scanEntireVault,
        includeFolders: [...setup.includeFolders],
        defaultTimedTaskReminderMinutes: setup.defaultTimedTaskReminderMinutes,
        defaultInformationalEventReminderMinutes: setup.defaultInformationalEventReminderMinutes,
        allDayTaskRemindersEnabled: setup.allDayTaskRemindersEnabled,
        defaultAllDayTaskReminderMinutes: setup.defaultAllDayTaskReminderMinutes,
        defaultEventDurationMinutes: setup.defaultEventDurationMinutes,
        defaultMorningEventTime: setup.defaultMorningEventTime,
        mobileOptimizations: setup.mobileOptimizations,
        mobileSyncLimit: setup.mobileSyncLimit,
        syncEnabled: false
    };
}
