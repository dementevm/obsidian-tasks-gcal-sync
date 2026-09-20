import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type GoogleCalendarSync from './main';
import { GoogleCalendarSettings } from './types';
import { useStore } from './store';
import { Notice } from 'obsidian';

export const DEFAULT_SETTINGS: GoogleCalendarSettings = {
    clientId: '',
    clientSecretName: '',
    oauthRedirectUri: 'https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/',
    oauth2Tokens: undefined,
    syncEnabled: false,
    calendarId: '',
    primaryCalendarConfirmed: false,
    scanEntireVault: false,
    defaultReminder: 30,
    defaultTimedTaskReminderMinutes: 30,
    defaultInformationalEventReminderMinutes: 0,
    allDayTaskRemindersEnabled: false,
    defaultEventDurationMinutes: 5,
    defaultMorningEventTime: '09:00',
    includeFolders: [],
    taskMetadata: {},
    taskIds: {},
    verboseLogging: false,
    hasCompletedOnboarding: true,  // Set to true to prevent welcome modal on startup
    mobileSyncLimit: 100,  // Default to 100 files on mobile
    mobileOptimizations: true,  // Enable mobile optimizations by default
    settingsSchemaVersion: 3,
};

export class GoogleCalendarSettingsTab extends PluginSettingTab {
    plugin: GoogleCalendarSync;

    constructor(app: App, plugin: GoogleCalendarSync) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Google Calendar Sync Settings' });

        // Sync Settings Section
        containerEl.createEl('h3', { text: 'Sync Settings' });

        new Setting(containerEl)
            .setName('Auto-sync')
            .setDesc('Automatically sync tasks when they are created or modified')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.syncEnabled = value;
                    useStore.getState().setSyncEnabled(value);
                    await this.plugin.saveSettings();
                    this.plugin.updateStatusBar();
                    new Notice(`Auto-sync ${value ? 'enabled' : 'disabled'}`);
                }));

        new Setting(containerEl)
            .setName('Scan Entire Vault')
            .setDesc('Explicitly allow this plugin to scan every Markdown file in the vault. When disabled, only the folders below are scanned.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.scanEntireVault)
                .onChange(async (value) => {
                    this.plugin.settings.scanEntireVault = value;
                    await this.plugin.saveSettings();
                    this.display();
                }));

        if (!this.plugin.settings.scanEntireVault) {
            new Setting(containerEl)
                .setName('Folders to Sync')
                .setDesc('Only these folders/files are scanned. If nothing matches, sync stops safely instead of falling back to the whole vault.')
                .addTextArea(text => text
                    .setPlaceholder('folder1\nfolder2/subfolder')
                    .setValue(this.plugin.settings.includeFolders.join('\n'))
                    .onChange(async (value) => {
                        this.plugin.settings.includeFolders = value
                            .split('\n')
                            .map(folder => folder.trim())
                            .filter(folder => folder.length > 0);
                        await this.plugin.saveSettings();
                    }));
        }

        // Calendar Settings Section
        containerEl.createEl('h3', { text: 'Calendar Settings' });

        new Setting(containerEl)
            .setName('Calendar ID')
            .setDesc('Paste the full ID of a dedicated Google calendar. Using "primary" is allowed only after explicit confirmation.')
            .addText(text => text
                .setPlaceholder('...@group.calendar.google.com')
                .setValue(this.plugin.settings.calendarId || '')
                .onChange(async (value) => {
                    const nextId = value.trim();
                    if (nextId === 'primary' && !this.plugin.settings.primaryCalendarConfirmed) {
                        const confirmed = window.confirm(
                            'Use your PRIMARY Google Calendar?\n\n' +
                            'Obsidian-managed events can be created, updated, and explicitly deleted there. ' +
                            'A dedicated calendar is safer. Continue?'
                        );
                        if (!confirmed) {
                            this.plugin.settings.calendarId = '';
                            this.plugin.settings.primaryCalendarConfirmed = false;
                            await this.plugin.saveSettings();
                            this.display();
                            return;
                        }
                        this.plugin.settings.primaryCalendarConfirmed = true;
                    } else if (nextId !== 'primary') {
                        this.plugin.settings.primaryCalendarConfirmed = false;
                    }
                    this.plugin.settings.calendarId = nextId;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Timed Task Reminder')
            .setDesc('Default popup in minutes before a checkbox task with an explicit ⏰ time.')
            .addText(text => text
                .setPlaceholder('30')
                .setValue(this.plugin.settings.defaultTimedTaskReminderMinutes.toString())
                .onChange(async (value) => {
                    const reminder = parseInt(value);
                    if (!isNaN(reminder) && reminder >= 0) {
                        this.plugin.settings.defaultTimedTaskReminderMinutes = reminder;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Informational Event Reminder')
            .setDesc('Default popup in minutes before a 📆 event when 🔔 is omitted. 0 means at event start.')
            .addText(text => text
                .setPlaceholder('0')
                .setValue(this.plugin.settings.defaultInformationalEventReminderMinutes.toString())
                .onChange(async (value) => {
                    const reminder = parseInt(value);
                    if (!isNaN(reminder) && reminder >= 0) {
                        this.plugin.settings.defaultInformationalEventReminderMinutes = reminder;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('All-day Task Reminders')
            .setDesc('All-day checkbox tasks have no popup by default. Enable only if you intentionally want Google all-day reminder behavior (relative to midnight).')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.allDayTaskRemindersEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.allDayTaskRemindersEnabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Event Duration')
            .setDesc('Duration in minutes for timed tasks that do not specify an end time.')
            .addText(text => text
                .setPlaceholder('5')
                .setValue((this.plugin.settings.defaultEventDurationMinutes ?? 5).toString())
                .onChange(async (value) => {
                    const duration = parseInt(value);
                    if (!isNaN(duration) && duration > 0 && duration <= 1440) {
                        this.plugin.settings.defaultEventDurationMinutes = duration;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Morning Event Time')
            .setDesc('Default time for 📆 informational events that have a date but no explicit ⏰ time.')
            .addText(text => text
                .setPlaceholder('09:00')
                .setValue(this.plugin.settings.defaultMorningEventTime || '09:00')
                .onChange(async (value) => {
                    const normalized = value.trim();
                    if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized)) {
                        this.plugin.settings.defaultMorningEventTime = normalized;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Verbose Logging')
            .setDesc('Enable detailed debug logging (useful for troubleshooting)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.verboseLogging)
                .onChange(async (value) => {
                    this.plugin.settings.verboseLogging = value;
                    await this.plugin.saveSettings();
                }));

        // Mobile Settings Section
        containerEl.createEl('h3', { text: 'Mobile Optimizations' });

        new Setting(containerEl)
            .setName('Enable Mobile Optimizations')
            .setDesc('Apply mobile-specific optimizations for better performance on mobile devices')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.mobileOptimizations ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.mobileOptimizations = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Mobile Sync File Limit')
            .setDesc('Maximum number of files to scan for tasks on mobile devices (lower values improve performance)')
            .addText(text => text
                .setPlaceholder('100')
                .setValue((this.plugin.settings.mobileSyncLimit ?? 100).toString())
                .onChange(async (value) => {
                    const limit = parseInt(value);
                    if (!isNaN(limit) && limit > 0) {
                        this.plugin.settings.mobileSyncLimit = limit;
                        await this.plugin.saveSettings();
                    }
                }));

        // OAuth Settings Section
        containerEl.createEl('h3', { text: 'Google OAuth (Privacy-first)' });

        const oauthDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
        oauthDesc.style.marginBottom = '1em';
        oauthDesc.createEl('p', {
            text: 'Use your own Google Cloud Web application OAuth client. Authentication goes directly between Obsidian and Google; the redirect bridge only returns the one-time authorization code to Obsidian.'
        });
        oauthDesc.createEl('p', {
            text: 'The client secret and refresh token are stored in Obsidian SecretStorage and are not written to this plugin\'s data.json.'
        });

        new Setting(containerEl)
            .setName('OAuth Client ID')
            .setDesc('Client ID from your Google Cloud Web application OAuth client.')
            .addText(text => text
                .setPlaceholder('xxxxxx.apps.googleusercontent.com')
                .setValue(this.plugin.settings.clientId || '')
                .onChange(async (value) => {
                    this.plugin.settings.clientId = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('OAuth Client Secret')
            .setDesc('Select or create a SecretStorage entry containing the client secret. The secret value stays local to this device.')
            .addComponent(el => new SecretComponent(this.app, el)
                .setValue(this.plugin.settings.clientSecretName || '')
                .onChange(async (value) => {
                    this.plugin.settings.clientSecretName = value ?? '';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('OAuth Redirect Bridge URL')
            .setDesc('HTTPS URL of the static OAuth bridge. It must exactly match an Authorized redirect URI in your Google Cloud OAuth client.')
            .addText(text => text
                .setPlaceholder('https://dementevm.github.io/obsidian-tasks-gcal-sync-bridge/')
                .setValue(this.plugin.settings.oauthRedirectUri || '')
                .onChange(async (value) => {
                    this.plugin.settings.oauthRedirectUri = value.trim();
                    await this.plugin.saveSettings();
                }));

        const authNote = containerEl.createEl('div', { cls: 'setting-item-description' });
        authNote.style.marginTop = '0.75em';
        authNote.createEl('p', {
            text: 'Because SecretStorage is device-local, add/select the client-secret entry once on each device. Each device keeps its own Google refresh token.'
        });
    }
}