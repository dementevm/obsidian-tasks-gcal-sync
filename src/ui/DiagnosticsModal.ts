import { App, Modal, Notice, Setting } from 'obsidian';
import type GoogleCalendarSyncPlugin from '../core/main';
import { useStore } from '../core/store';
import { TimeUtils } from '../utils/timeUtils';

export class DiagnosticsModal extends Modal {
    constructor(
        app: App,
        private plugin: GoogleCalendarSyncPlugin
    ) {
        super(app);
    }

    onOpen(): void {
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Google Calendar Sync Diagnostics' });

        const state = useStore.getState();
        const scope = this.plugin.settings.scanEntireVault
            ? 'Entire vault'
            : (this.plugin.settings.includeFolders.length > 0
                ? this.plugin.settings.includeFolders.join(', ')
                : 'No folders configured');

        const rows: Array<[string, string]> = [
            ['Authentication', this.plugin.authManager?.isAuthenticated() ? 'Connected' : 'Disconnected'],
            ['Calendar ID', this.plugin.settings.calendarId || 'Not configured'],
            ['Primary confirmed', this.plugin.settings.calendarId === 'primary'
                ? (this.plugin.settings.primaryCalendarConfirmed ? 'Yes' : 'No')
                : 'Not applicable'],
            ['Sync scope', scope],
            ['Auto-sync', state.syncEnabled ? 'On' : 'Off'],
            ['Current device timezone', TimeUtils.getLocalTimeZone()],
            ['Tracked items', String(Object.keys(this.plugin.settings.taskMetadata).length)],
            ['Pending queue', String(state.syncQueue.size)],
            ['Failed items', String(state.failedSyncs.size)],
            ['Last sync', state.lastSyncTime
                ? new Date(state.lastSyncTime).toLocaleString()
                : 'Never'],
            ['Last status', state.status],
            ['Last error', state.error?.message || 'None']
        ];

        const table = contentEl.createEl('table', { cls: 'gcal-diagnostics-table' });
        for (const [label, value] of rows) {
            const row = table.createEl('tr');
            row.createEl('td', { text: label });
            row.createEl('td', { text: value });
        }

        contentEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Setup links include non-secret configuration only. OAuth client secrets and refresh tokens remain device-local in SecretStorage.'
        });

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Test connection')
                .onClick(async () => {
                    button.setDisabled(true);
                    try {
                        await this.plugin.testCalendarConnection();
                        new Notice('Google Calendar connection is working.');
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        new Notice(`Connection test failed: ${message}`, 10000);
                    } finally {
                        button.setDisabled(false);
                        this.render();
                    }
                }))
            .addButton(button => button
                .setButtonText('Sync now')
                .onClick(async () => {
                    await this.plugin.syncNow();
                    this.render();
                }));

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Copy setup link')
                .onClick(async () => {
                    await this.plugin.copySetupLink();
                }))
            .addButton(button => button
                .setButtonText('Clean orphaned items…')
                .setWarning()
                .onClick(async () => {
                    await this.plugin.cleanupOrphansWithConfirmation();
                    this.render();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
