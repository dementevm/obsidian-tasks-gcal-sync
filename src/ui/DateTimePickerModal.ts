import { Editor, Modal, Notice, Setting } from 'obsidian';
import type GoogleCalendarSyncPlugin from '../core/main';
import { TimeUtils } from '../utils/timeUtils';
import { formatDurationReminder } from './ReminderModal';
import { DATE_PATTERN, DURATION_PATTERN, REMINDER_PATTERN, TIME_PATTERN } from '../tasks/taskParser';

// Existing date/time/duration/reminder tokens, plus a bare 📅 with no value yet.
const SCHEDULE_TOKENS = new RegExp(
    [DATE_PATTERN, TIME_PATTERN, DURATION_PATTERN, REMINDER_PATTERN, /📅/]
        .map(pattern => `\\s*${pattern.source}`).join('|'),
    'g'
);

/**
 * Fills in the value after a freshly inserted 📅 token (plus optional ⏰, ⏱, 🔔),
 * or, with `eventLine`, edits those tokens on an existing 📆 event line.
 */
export class DateTimePickerModal extends Modal {
    private date = TimeUtils.getCurrentDate();
    private time = '';
    private duration = '';
    private reminder = '';

    constructor(
        private plugin: GoogleCalendarSyncPlugin,
        private editor: Editor,
        private eventLine?: number
    ) {
        super(plugin.app);
        if (eventLine === undefined) return;

        const line = editor.getLine(eventLine);
        const duration = line.match(DURATION_PATTERN);
        const reminder = line.match(REMINDER_PATTERN);
        this.date = line.match(DATE_PATTERN)?.[1] ?? this.date;
        this.time = line.match(TIME_PATTERN)?.[1].padStart(5, '0') ?? '';
        this.duration = duration ? duration[1] + duration[2] : '';
        this.reminder = reminder ? reminder[1] + reminder[2] : '';
    }

    onOpen(): void {
        const { contentEl } = this;
        const settings = this.plugin.settings;
        const isEvent = this.eventLine !== undefined;
        const defaultReminder = isEvent
            ? settings.defaultInformationalEventReminderMinutes
            : settings.defaultTimedTaskReminderMinutes;
        contentEl.empty();
        let dateInput: HTMLInputElement | null = null;

        new Setting(contentEl)
            .setName('Date')
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.date);
                text.onChange(value => { this.date = value; });
                dateInput = text.inputEl;
            });

        new Setting(contentEl)
            .setName('Time')
            .setDesc(isEvent
                ? `Optional. Empty means Morning Event Time (${settings.defaultMorningEventTime}).`
                : 'Optional. Empty means an all-day task.')
            .addText(text => {
                text.inputEl.type = 'time';
                text.setValue(this.time);
                text.onChange(value => { this.time = value; });
            });

        new Setting(contentEl)
            .setName('Duration')
            .setDesc(`Optional: 20m, 1h. Empty uses ${settings.defaultEventDurationMinutes}m.`)
            .addText(text => text
                .setPlaceholder(`${settings.defaultEventDurationMinutes}m`)
                .setValue(this.duration)
                .onChange(value => { this.duration = value; }));

        new Setting(contentEl)
            .setName('Reminder')
            .setDesc(`Optional: 30m, 2h, 1d. Empty uses the default reminder (${defaultReminder}m).`)
            .addText(text => text
                .setPlaceholder(`${defaultReminder}m`)
                .setValue(this.reminder)
                .onChange(value => { this.reminder = value; }));

        if (!isEvent) {
            contentEl.createDiv({
                cls: 'setting-item-description',
                text: 'Cancel (or Esc) — type the date manually. The picker can be turned off in settings.'
            });
        }

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(isEvent ? 'Save' : 'Insert')
                .setCta()
                .onClick(() => this.insert()))
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => this.close()));

        this.scope.register([], 'Enter', () => { this.insert(); return false; });

        const input = dateInput as HTMLInputElement | null;
        input?.focus();
        try {
            input?.showPicker();
        } catch {
            // Not supported on this platform; the focused input still works.
        }
    }

    private insert(): void {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
            new Notice('Choose a valid date.');
            return;
        }
        const extras = formatDurationReminder(this.duration, this.reminder);
        if (extras === null) return;

        const value = `${this.date}${this.time ? ` ⏰ ${this.time}` : ''}${extras}`;
        if (this.eventLine === undefined) {
            this.editor.replaceSelection(`${value} `);
        } else {
            const line = this.editor.getLine(this.eventLine).replace(SCHEDULE_TOKENS, '').trimEnd();
            this.editor.setLine(this.eventLine, `${line} 📅 ${value}`);
        }
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
