import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    TFile
} from 'obsidian';

interface CalendarTokenSuggestion {
    key: string;
    aliases: string[];
    token: string;
    label: string;
    description: string;
}

const SUGGESTIONS: CalendarTokenSuggestion[] = [
    {
        key: 'event',
        aliases: ['ev', 'calendar'],
        token: '📆',
        label: '📆 Event',
        description: 'Informational calendar event / reminder'
    },
    {
        key: 'date',
        aliases: ['due'],
        token: '📅',
        label: '📅 Date',
        description: 'Calendar date'
    },
    {
        key: 'time',
        aliases: ['at'],
        token: '⏰',
        label: '⏰ Time',
        description: 'Event start time'
    },
    {
        key: 'reminder',
        aliases: ['rem', 'alert'],
        token: '🔔',
        label: '🔔 Reminder',
        description: 'Reminder offset, for example 30m or 2h'
    },
    {
        key: 'duration',
        aliases: ['dur', 'length'],
        token: '⏱',
        label: '⏱ Duration',
        description: 'Duration, for example 20m or 1h'
    },
    {
        key: 'end',
        aliases: ['until'],
        token: '➡️',
        label: '➡️ End time',
        description: 'Explicit event end time'
    }
];

export class CalendarTokenSuggest extends EditorSuggest<CalendarTokenSuggestion> {
    constructor(app: App) {
        super(app);
        this.limit = 8;
    }

    onTrigger(
        cursor: EditorPosition,
        editor: Editor,
        _file: TFile | null
    ): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const beforeCursor = line.slice(0, cursor.ch);
        const match = beforeCursor.match(/(?:^|\s)@([a-z]*)$/i);

        if (!match) {
            return null;
        }

        const atIndex = beforeCursor.lastIndexOf('@');
        if (atIndex < 0) {
            return null;
        }

        // Keep suggestions explicit and local to list/task-style lines so normal
        // prose containing @ mentions is unaffected.
        const linePrefix = beforeCursor.slice(0, atIndex);
        if (!/^\s*-/.test(linePrefix)) {
            return null;
        }

        return {
            start: { line: cursor.line, ch: atIndex },
            end: cursor,
            query: match[1] ?? ''
        };
    }

    getSuggestions(context: EditorSuggestContext): CalendarTokenSuggestion[] {
        const query = context.query.toLowerCase();
        if (!query) {
            return SUGGESTIONS;
        }

        return SUGGESTIONS.filter(item =>
            item.key.startsWith(query) ||
            item.aliases.some(alias => alias.startsWith(query)) ||
            item.label.toLowerCase().includes(query)
        );
    }

    renderSuggestion(value: CalendarTokenSuggestion, el: HTMLElement): void {
        const title = el.createDiv();
        title.setText(value.label);

        const description = el.createDiv({ cls: 'setting-item-description' });
        description.setText(value.description);
    }

    selectSuggestion(value: CalendarTokenSuggestion): void {
        if (!this.context) {
            return;
        }

        this.context.editor.replaceRange(
            `${value.token} `,
            this.context.start,
            this.context.end
        );
    }
}
