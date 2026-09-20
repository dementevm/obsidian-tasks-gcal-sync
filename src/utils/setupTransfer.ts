import type { GoogleCalendarSettings } from '../core/types';

export interface ShareableCalendarSetup {
    version: 1;
    clientId: string;
    oauthRedirectUri: string;
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
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

export function createShareableSetup(settings: GoogleCalendarSettings): ShareableCalendarSetup {
    return {
        version: 1,
        clientId: settings.clientId,
        oauthRedirectUri: settings.oauthRedirectUri,
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

export function decodeSetup(encoded: string): ShareableCalendarSetup {
    const json = new TextDecoder().decode(base64UrlToBytes(encoded));
    const parsed = JSON.parse(json) as Partial<ShareableCalendarSetup>;

    if (parsed.version !== 1) throw new Error('Unsupported setup-link version.');
    if (typeof parsed.clientId !== 'string') throw new Error('Invalid setup link: clientId.');
    if (typeof parsed.oauthRedirectUri !== 'string') throw new Error('Invalid setup link: redirect URI.');
    if (typeof parsed.calendarId !== 'string') throw new Error('Invalid setup link: calendar ID.');
    if (typeof parsed.scanEntireVault !== 'boolean') throw new Error('Invalid setup link: sync scope.');
    if (!Array.isArray(parsed.includeFolders)) throw new Error('Invalid setup link: folders.');

    return parsed as ShareableCalendarSetup;
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
        oauthRedirectUri: setup.oauthRedirectUri,
        calendarId: setup.calendarId,
        // Primary-calendar confirmation is deliberately never transferred.
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
        // Importing configuration never silently turns background sync on.
        syncEnabled: false
    };
}
