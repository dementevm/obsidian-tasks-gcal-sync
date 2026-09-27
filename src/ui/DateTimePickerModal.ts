import { Editor, Modal, Notice, Setting } from 'obsidian';
import type GoogleCalendarSyncPlugin from '../core/main';
import { TimeUtils } from '../utils/timeUtils';
import { formatDurationReminder } from './ReminderModal';

/** Fills in the value after a freshly inserted 📅 token (plus optional ⏰, ⏱, 🔔). */
export class DateTimePickerModal extends Modal {
    private date = TimeUtils.getCurrentDate();
    private time = '';
    private duration = '';
    private reminder = '';

    constructor(private plugin: GoogleCalendarSyncPlugin, private editor: Editor) {
        super(plugin.app);
    }

    onOpen(): void {
        const { contentEl } = this;
        const settings = this.plugin.settings;
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
            .setDesc('Optional. Empty means an all-day task.')
            .addText(text => {
                text.inputEl.type = 'time';
                text.onChange(value => { this.time = value; });
            });

        new Setting(contentEl)
            .setName('Duration')
            .setDesc(`Optional: 20m, 1h. Empty uses ${settings.defaultEventDurationMinutes}m.`)
            .addText(text => text
                .setPlaceholder(`${settings.defaultEventDurationMinutes}m`)
                .onChange(value => { this.duration = value; }));

        new Setting(contentEl)
            .setName('Reminder')
            .setDesc(`Optional: 30m, 2h, 1d. Empty uses the default reminder (${settings.defaultTimedTaskReminderMinutes}m).`)
            .addText(text => text
                .setPlaceholder(`${settings.defaultTimedTaskReminderMinutes}m`)
                .onChange(value => { this.reminder = value; }));

        contentEl.createDiv({
            cls: 'setting-item-description',
            text: 'Cancel (or Esc) — type the date manually. The picker can be turned off in settings.'
        });

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Insert')
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

        this.editor.replaceSelection(`${this.date}${this.time ? ` ⏰ ${this.time}` : ''}${extras} `);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
