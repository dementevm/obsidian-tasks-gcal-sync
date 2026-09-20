import { App, Editor, Modal, Notice, Setting } from 'obsidian';
import type GoogleCalendarSyncPlugin from '../core/main';
import { TimeUtils } from '../utils/timeUtils';

function normalizeOffset(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return '';
    return /^\d+(?:m|h|d)$/.test(trimmed) ? trimmed : null;
}

function normalizeDuration(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return '';
    return /^\d+(?:m|h)$/.test(trimmed) ? trimmed : null;
}

function offsetToMinutes(value: string): number {
    const match = value.match(/^(\d+)([mhd])$/);
    if (!match) return 0;
    const amount = Number(match[1]);
    return match[2] === 'd' ? amount * 1440 : match[2] === 'h' ? amount * 60 : amount;
}

function durationToMinutes(value: string): number {
    const match = value.match(/^(\d+)([mh])$/);
    if (!match) return 0;
    const amount = Number(match[1]);
    return match[2] === 'h' ? amount * 60 : amount;
}

export class ReminderModal extends Modal {
    private title = '';
    private date = TimeUtils.getCurrentDate();
    private time = '';
    private reminder = '';
    private duration = '';

    constructor(
        app: App,
        private plugin: GoogleCalendarSyncPlugin,
        private editor: Editor
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Create Calendar Reminder' });

        new Setting(contentEl)
            .setName('Title')
            .addText(text => text
                .setPlaceholder('Wife has a manicure')
                .onChange(value => { this.title = value.trim(); }));

        new Setting(contentEl)
            .setName('Date')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.date);
                text.onChange(value => { this.date = value; });
            });

        new Setting(contentEl)
            .setName('Time')
            .setDesc(`Optional. Empty means Morning Event Time (${this.plugin.settings.defaultMorningEventTime}).`)
            .addText(text => {
                text.inputEl.type = 'time';
                text.onChange(value => { this.time = value; });
            });

        new Setting(contentEl)
            .setName('Reminder')
            .setDesc(`Optional: 30m, 2h, 1d. Empty uses the default informational reminder (${this.plugin.settings.defaultInformationalEventReminderMinutes}m).`)
            .addText(text => text
                .setPlaceholder('30m')
                .onChange(value => { this.reminder = value; }));

        new Setting(contentEl)
            .setName('Duration')
            .setDesc(`Optional: 20m, 1h. Empty uses ${this.plugin.settings.defaultEventDurationMinutes}m.`)
            .addText(text => text
                .setPlaceholder('45m')
                .onChange(value => { this.duration = value; }));

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Create')
                .setCta()
                .onClick(() => this.createReminder()))
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    private createReminder(): void {
        if (!this.title) {
            new Notice('Reminder title is required.');
            return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
            new Notice('Choose a valid date.');
            return;
        }

        const reminder = normalizeOffset(this.reminder);
        if (reminder === null || (reminder && offsetToMinutes(reminder) > 40320)) {
            new Notice('Reminder must look like 30m, 2h, or 1d and be no more than 28 days.');
            return;
        }

        const duration = normalizeDuration(this.duration);
        if (duration === null || (duration && durationToMinutes(duration) > 1440)) {
            new Notice('Duration must look like 20m or 1h and be no more than 24 hours.');
            return;
        }

        let line = `- 📆 ${this.title} 📅 ${this.date}`;
        if (this.time) line += ` ⏰ ${this.time}`;
        if (duration) line += ` ⏱${duration}`;
        if (reminder) line += ` 🔔${reminder}`;

        const cursor = this.editor.getCursor();
        const currentLine = this.editor.getLine(cursor.line);
        if (currentLine.trim().length === 0) {
            this.editor.replaceRange(line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: currentLine.length });
        } else {
            this.editor.replaceRange(`\n${line}`, { line: cursor.line, ch: currentLine.length });
        }
        this.close();
        new Notice('Calendar reminder added to Obsidian.');
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
