import { Extension, StateField, StateEffect, RangeSet, RangeSetBuilder, EditorState, Transaction } from "@codemirror/state"
import { EditorView, Decoration, DecorationSet, WidgetType, ViewPlugin, ViewUpdate } from "@codemirror/view"
import { TFile, TAbstractFile, Editor, Platform } from "obsidian"
import type GoogleCalendarSyncPlugin from '../core/main'
import { LogUtils } from '../utils/logUtils'
import { ErrorUtils } from '../utils/errorUtils'
import { IdUtils } from '../utils/idUtils'
import debounce from 'just-debounce-it'


class ZeroWidthWidget extends WidgetType {
    constructor(readonly content: string) {
        super()
    }

    eq(other: ZeroWidthWidget) {
        return other.content === this.content
    }

    toDOM() {
        const wrap = document.createElement('span')
        wrap.className = 'tasks-gcal-sync-task-id'
        wrap.setAttribute('aria-hidden', 'true')
        return wrap
    }

    ignoreEvent() {
        return true
    }
}

export class TokenController {
    private plugin: GoogleCalendarSyncPlugin
    private modifyLock = false
    private readonly ID_PATTERN = /<!-- task-id: ([a-z0-9]+) -->/g
    private readonly COMPLETION_PATTERN = /✅ \d{4}-\d{2}-\d{2}/g
    private readonly fileRepairPromises = new Map<string, Promise<boolean>>()
    private readonly pendingDeletionTimers = new Map<string, number>()
    private readonly pendingViewReconciliations = new WeakSet<EditorView>()
    private lastEditTime: number = 0

    constructor(plugin: GoogleCalendarSyncPlugin) {
        this.plugin = plugin
        this.registerEditorHandlers()
    }

    private generateFreshTaskId(usedIds: Set<string>): string {
        let id = IdUtils.generateTimeBasedId()
        while (usedIds.has(id)) {
            id = IdUtils.generateTimeBasedId()
        }

        usedIds.add(id)
        return id
    }

    /**
     * Keep the plugin's private ID before user text and before any Obsidian Tasks
     * metadata. Obsidian Tasks parses its metadata from right to left and stops
     * at unknown trailing text, so an HTML comment at the end of the line breaks
     * recurrence/date parsing.
     *
     * Canonical forms:
     * - [ ] <!-- task-id: ... --> title ... 📅 YYYY-MM-DD
     * - 📆 <!-- task-id: ... --> title ... 📅 YYYY-MM-DD
     */
    public normalizeSyncItemLineForTasksCompatibility(line: string): string {
        const idMatches = Array.from(line.matchAll(this.ID_PATTERN))
        if (idMatches.length === 0) return line

        const taskIdText = idMatches[0][0]

        // Fast path: if the private ID is already directly after the task/event
        // marker and every complete calendar-only token is already in the
        // metadata prefix, leave the line byte-for-byte untouched. In
        // particular, do not collapse spaces while the user is editing a title:
        // replacing the whole line for cosmetic whitespace changes can move the
        // CodeMirror cursor back to the start of the task.
        if (idMatches.length === 1) {
            const canonicalMatch = line.match(
                /^(\s*-\s+(?:\[[ xX]\]|📆))\s+(<!-- task-id: [a-z0-9]+ -->)(.*)$/
            )

            if (canonicalMatch) {
                let tail = canonicalMatch[3].trimStart()
                const tokenAtStart =
                    /^(?:⏰\s*\d{1,2}:\d{2}|➡️\s*\d{1,2}:\d{2}|⏱\s*\d+[mh]|🔔\s*\d+[mhd])(?=\s|$)/i
                const tokenAnywhere =
                    /(?:^|\s)(?:⏰\s*\d{1,2}:\d{2}|➡️\s*\d{1,2}:\d{2}|⏱\s*\d+[mh]|🔔\s*\d+[mhd])(?=\s|$)/i

                while (true) {
                    const prefixToken = tail.match(tokenAtStart)
                    if (!prefixToken) break
                    tail = tail.slice(prefixToken[0].length).trimStart()
                }

                if (!tokenAnywhere.test(tail)) {
                    return line
                }
            }
        }

        let withoutIds = line.replace(this.ID_PATTERN, '')

        const anchorMatch =
            withoutIds.match(/^(\s*-\s+\[[ xX]\])(?:\s+|$)/) ||
            withoutIds.match(/^(\s*-\s+📆)(?:\s+|$)/)

        if (!anchorMatch) return line

        let remainder = withoutIds.slice(anchorMatch[0].length).trim()
        remainder = remainder.replace(/[ \t]{2,}/g, ' ')

        // Our calendar-only metadata is unknown to Obsidian Tasks. Keep all
        // of it immediately after the private ID so the user-visible title and
        // Tasks-owned metadata (recurrence, due date, done date, etc.) remain
        // contiguous at the end of the line. Tasks parses its metadata from the
        // end, so a trailing ⏰/➡️/⏱/🔔 token can otherwise hide recurrence.
        const calendarMetadataPatterns = [
            /⏰\s*\d{1,2}:\d{2}/,
            /➡️\s*\d{1,2}:\d{2}/,
            /⏱\s*\d+[mh]/,
            /🔔\s*\d+[mhd]/
        ]

        const calendarMetadata: string[] = []
        for (const pattern of calendarMetadataPatterns) {
            const match = remainder.match(pattern)
            if (!match) continue
            calendarMetadata.push(match[0])
            remainder = remainder.replace(match[0], ' ')
        }

        remainder = remainder
            .replace(/[ \t]{2,}/g, ' ')
            .trim()

        return [
            anchorMatch[1],
            taskIdText,
            ...calendarMetadata,
            remainder
        ].filter(Boolean).join(' ')
    }

    public repairSyncContentForRecurringTasks(content: string): {
        content: string
        changed: boolean
        reassigned: number
    } {
        if (!content.includes('<!-- task-id:')) {
            return { content, changed: false, reassigned: 0 }
        }

        const lines = content.split('\n')
        let changed = false
        let reassigned = 0

        // First normalize hidden-ID placement so Obsidian Tasks can parse all
        // recurrence/date metadata regardless of editor mode.
        for (let i = 0; i < lines.length; i++) {
            if (!this.isSyncItemLine(lines[i]) ||
                !/<!-- task-id: [a-z0-9]+ -->/.test(lines[i])) {
                continue
            }

            const normalized = this.normalizeSyncItemLineForTasksCompatibility(lines[i])
            if (normalized !== lines[i]) {
                lines[i] = normalized
                changed = true
            }
        }

        // Then repair IDs copied by Obsidian Tasks when it materializes the next
        // recurring occurrence. The completed occurrence keeps the original ID;
        // every other copy gets a fresh identity before calendar sync can see it.
        const groups = new Map<string, number[]>()
        const usedIds = new Set<string>(Object.keys(this.plugin.settings.taskMetadata))

        for (let i = 0; i < lines.length; i++) {
            if (!this.isSyncItemLine(lines[i])) continue

            const match = lines[i].match(/<!-- task-id: ([a-z0-9]+) -->/)
            if (!match) continue

            usedIds.add(match[1])
            const indexes = groups.get(match[1]) || []
            indexes.push(i)
            groups.set(match[1], indexes)
        }

        for (const [duplicatedId, indexes] of groups) {
            if (indexes.length < 2) continue

            const completedIndex = indexes.find(index =>
                /^\s*-\s+\[[xX]\]/.test(lines[index])
            )
            const keeperIndex = completedIndex ?? indexes[0]

            for (const index of indexes) {
                if (index === keeperIndex) continue

                const freshId = this.generateFreshTaskId(usedIds)
                lines[index] = this.normalizeSyncItemLineForTasksCompatibility(
                    lines[index].replace(
                        `<!-- task-id: ${duplicatedId} -->`,
                        `<!-- task-id: ${freshId} -->`
                    )
                )
                changed = true
                reassigned++

                LogUtils.debug(
                    `Reassigned file-level recurring task ID ${duplicatedId} -> ${freshId}`
                )
            }
        }

        return {
            content: changed ? lines.join('\n') : content,
            changed,
            reassigned
        }
    }

    /**
     * Repair a Markdown file independently of CodeMirror. This is the critical
     * path for Reading mode/mobile, where Obsidian Tasks updates the vault but
     * there may be no active editor transaction for us to observe.
     */
    public async repairTaskIdsInFile(file: TFile): Promise<boolean> {
        const existing = this.fileRepairPromises.get(file.path)
        if (existing) return existing

        const repairPromise = (async () => {
            const content = await this.plugin.app.vault.read(file)
            const repaired = this.repairSyncContentForRecurringTasks(content)
            if (!repaired.changed) return false

            this.modifyLock = true
            try {
                await this.plugin.app.vault.modify(file, repaired.content)
            } finally {
                this.modifyLock = false
            }

            LogUtils.debug(
                `Repaired recurring IDs in ${file.path}; reassigned=${repaired.reassigned}`
            )
            return true
        })()

        this.fileRepairPromises.set(file.path, repairPromise)
        try {
            return await repairPromise
        } finally {
            if (this.fileRepairPromises.get(file.path) === repairPromise) {
                this.fileRepairPromises.delete(file.path)
            }
        }
    }

    public normalizeTaskIdsInView(view: EditorView): boolean {
        const doc = view.state.doc
        const changes: { from: number, to: number, insert: string }[] = []

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i)
            const hasId = /<!-- task-id: [a-z0-9]+ -->/.test(line.text)

            // Recover an ID pushed to its own line by an edit.
            if (hasId && !this.isSyncItemLine(line.text) && i > 1) {
                const idText = line.text.match(/<!-- task-id: [a-z0-9]+ -->/)?.[0]
                const prevLine = doc.line(i - 1)
                if (idText && this.isSyncItemLine(prevLine.text) &&
                    !/<!-- task-id: [a-z0-9]+ -->/.test(prevLine.text)) {
                    const updatedPrev = this.normalizeSyncItemLineForTasksCompatibility(
                        `${prevLine.text} ${idText}`
                    )
                    changes.push({ from: prevLine.from, to: prevLine.to, insert: updatedPrev })

                    const cleanedCurrent = line.text.replace(idText, '').trim()
                    changes.push({ from: line.from, to: line.to, insert: cleanedCurrent })
                    continue
                }
            }

            if (!hasId || !this.isSyncItemLine(line.text)) continue

            let normalized = this.normalizeSyncItemLineForTasksCompatibility(line.text)

            // Removing a completion state should also remove a stale completion date.
            this.COMPLETION_PATTERN.lastIndex = 0
            if (/^\s*-\s+\[ \]/.test(normalized) && this.COMPLETION_PATTERN.test(normalized)) {
                this.COMPLETION_PATTERN.lastIndex = 0
                normalized = normalized
                    .replace(this.COMPLETION_PATTERN, '')
                    .replace(/[ \t]{2,}/g, ' ')
                    .trimEnd()
                normalized = this.normalizeSyncItemLineForTasksCompatibility(normalized)
            }
            this.COMPLETION_PATTERN.lastIndex = 0

            if (normalized !== line.text) {
                changes.push({ from: line.from, to: line.to, insert: normalized })
            }
        }

        if (changes.length === 0) return false

        // A structural repair can replace a complete line. CodeMirror maps a
        // cursor inside a replaced range to the left edge by default, which
        // feels like the editor suddenly jumped to the beginning of the task.
        // Preserve the current selection and prefer the right edge of changed
        // ranges so normal typing never jumps back to the checkbox.
        const changeSet = view.state.changes(changes)
        const mappedSelection = view.state.selection.map(changeSet, 1)
        view.dispatch({
            changes: changeSet,
            selection: mappedSelection
        })
        return true
    }

    /**
     * One-time-on-load compatibility pass over files the plugin is already
     * allowed to inspect. This intentionally honours the feature branch's vault
     * scanning scope instead of reading the whole vault implicitly.
     */
    public async migrateTaskIdsForTasksCompatibility(): Promise<void> {
        const candidatePaths = new Set<string>()

        for (const metadata of Object.values(this.plugin.settings.taskMetadata)) {
            if (metadata.filePath) candidatePaths.add(metadata.filePath)
        }

        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            if (this.plugin.taskParser.isFileInScope(file)) {
                candidatePaths.add(file.path)
            }
        }

        let changedFiles = 0

        for (const path of candidatePaths) {
            const abstractFile = this.plugin.app.vault.getAbstractFileByPath(path)
            if (!(abstractFile instanceof TFile)) continue

            try {
                if (await this.repairTaskIdsInFile(abstractFile)) {
                    changedFiles++
                }
            } catch (error) {
                LogUtils.error(`Failed to repair task IDs in ${path}: ${error}`)
            }
        }

        if (changedFiles > 0) {
            LogUtils.info(
                `Tasks compatibility repair updated ${changedFiles} file(s)`
            )
        }
    }

    private cancelPendingDeletion(taskId: string): void {
        const timer = this.pendingDeletionTimers.get(taskId)
        if (timer !== undefined) {
            window.clearTimeout(timer)
            this.pendingDeletionTimers.delete(taskId)
        }
    }

    private scheduleMissingItemDeletion(taskId: string, sourceFilePath: string): void {
        this.cancelPendingDeletion(taskId)

        // Give file moves / LiveSync a grace window. Before deleting remotely we
        // rescan the entire configured scope, so moving a tracked line does not
        // become a false calendar deletion.
        const timer = window.setTimeout(async () => {
            this.pendingDeletionTimers.delete(taskId)

            try {
                const metadata = this.plugin.settings.taskMetadata[taskId]
                if (!metadata || metadata.filePath !== sourceFilePath) return

                const marker = `<!-- task-id: ${taskId} -->`
                for (const candidate of this.plugin.taskParser.getFilteredFiles()) {
                    const content = await this.plugin.app.vault.read(candidate)
                    if (!content.includes(marker)) continue

                    // The item was moved rather than deleted.
                    if (candidate.path !== metadata.filePath) {
                        metadata.filePath = candidate.path
                        await this.plugin.saveSettings()
                        LogUtils.debug(`Tracked item ${taskId} moved to ${candidate.path}; deletion cancelled`)
                    }
                    return
                }

                await this.plugin.handleTaskDeletion(taskId, metadata.eventId)
                LogUtils.debug(`Deleted calendar event after tracked line removal: ${taskId}`)
            } catch (error) {
                LogUtils.error(`Delayed deletion check failed for ${taskId}: ${error}`)
            }
        }, 3000)

        this.pendingDeletionTimers.set(taskId, timer)
    }

    private registerEditorHandlers() {
        // Track edits and keep IDs in the Tasks-compatible position.
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('editor-change', debounce((editor: Editor) => {
                const file = this.plugin.app.workspace.getActiveFile()
                if (!(file instanceof TFile) || !this.plugin.taskParser.isFileInScope(file)) {
                    return
                }

                this.lastEditTime = Date.now()
                this.ensureIdsAfterMarker(editor)
                this.ensureUniqueTaskIds(editor)
                this.checkForNewTasks(editor)
                this.handleTaskCompletionChanges(editor)
            }, 1000))
        )

        // Handle copy/paste to prevent ID duplication
        this.plugin.registerEvent(
            this.plugin.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
                const content = evt.clipboardData?.getData('text')
                if (!content) return

                // Remove any existing task IDs from pasted content
                const newContent = content.replace(this.ID_PATTERN, '')
                evt.clipboardData?.setData('text', newContent)
                LogUtils.debug('Stripped task IDs from pasted content')
            })
        )

        // Handle file modifications
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', async (file: TAbstractFile) => {
                if (!(file instanceof TFile)) return
                if (this.modifyLock) return
                if (!this.plugin.taskParser.isFileInScope(file)) return

                try {
                    // Reading mode has no CodeMirror editor transaction. Repair
                    // recurring IDs at the vault level before any calendar-sync
                    // handler can safely consume this file.
                    if (await this.repairTaskIdsInFile(file)) {
                        return
                    }

                    this.modifyLock = true
                    const content = await this.plugin.app.vault.read(file)
                    const lines = content.split('\n')
                    const explicitlyUnscheduledIds = new Set<string>()
                    const currentIds = new Set(
                        Array.from(content.matchAll(/<!-- task-id: ([a-z0-9]+) -->/g))
                            .map(match => match[1])
                    )

                    // A tracked line that disappeared from its source file is a
                    // deletion candidate. We verify it after a short grace period
                    // across the full configured scope before touching Google.
                    for (const [id, metadata] of Object.entries(this.plugin.settings.taskMetadata)) {
                        if (metadata?.filePath !== file.path) continue
                        if (currentIds.has(id)) {
                            this.cancelPendingDeletion(id)
                        } else {
                            this.scheduleMissingItemDeletion(id, file.path)
                        }
                    }

                    // Removing 📅 from a still-existing tracked line is an explicit
                    // "stop syncing this item" action. Missing IDs alone are NOT
                    // treated as deletions here because the line may have been moved
                    // between files/devices.
                    for (const line of lines) {
                        const idMatch = line.match(/<!-- task-id: ([a-z0-9]+) -->/)
                        if (idMatch && !this.isSyncItemLine(line)) {
                            explicitlyUnscheduledIds.add(idMatch[1])
                        }
                    }

                    let updatedContent = content
                    let changed = false
                    for (const id of explicitlyUnscheduledIds) {
                        const metadata = this.plugin.settings.taskMetadata[id]
                        if (metadata?.filePath && metadata.filePath !== file.path) continue

                        await this.plugin.handleTaskDeletion(id, metadata?.eventId)
                        updatedContent = updatedContent.replace(
                            new RegExp(`\\s*<!-- task-id: ${id} -->`, 'g'),
                            ''
                        )
                        changed = true
                        LogUtils.debug(`Stopped calendar tracking after 📅 removal: ${id}`)
                    }

                    if (changed && updatedContent !== content) {
                        await this.plugin.app.vault.modify(file, updatedContent)
                    }
                } catch (error) {
                    LogUtils.error(`File modification handler error: ${error}`)
                } finally {
                    this.modifyLock = false
                }
            })
        )
    }

    /**
     * Handles task completion status changes, specifically handling the cleanup 
     * of completion markers when a task is unticked
     */
    private handleTaskCompletionChanges(editor: Editor) {
        // @ts-ignore - cm exists on editor but is not typed
        const view = editor.cm as EditorView
        if (!view) return

        const doc = view.state.doc
        const changes: { from: number, to: number, insert: string }[] = []

        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i)
            if (!/^\s*-\s+\[ \]/.test(line.text) ||
                !/<!-- task-id: [a-z0-9]+ -->/.test(line.text)) {
                continue
            }

            this.COMPLETION_PATTERN.lastIndex = 0
            if (!this.COMPLETION_PATTERN.test(line.text)) {
                this.COMPLETION_PATTERN.lastIndex = 0
                continue
            }
            this.COMPLETION_PATTERN.lastIndex = 0

            let newLine = line.text
                .replace(this.COMPLETION_PATTERN, '')
                .replace(/[ \t]{2,}/g, ' ')
                .trimEnd()
            newLine = this.normalizeSyncItemLineForTasksCompatibility(newLine)

            if (newLine !== line.text) {
                changes.push({
                    from: line.from,
                    to: line.to,
                    insert: newLine
                })
            }
        }

        if (changes.length > 0) {
            view.dispatch({ changes })
        }
    }

    private isSyncItemLine(line: string): boolean {
        // Plain checklists are not calendar items. A tracked item must explicitly
        // contain a calendar date marker so shopping lists / arbitrary checklists
        // remain completely untouched by this plugin.
        const isTaskOrEvent = /^\s*-\s+(?:\[[ xX]\]\s+|📆\s+)/.test(line);
        return isTaskOrEvent && /📅\s*\d{4}-\d{2}-\d{2}/.test(line);
    }

    private ensureUniqueTaskIds(editor: Editor): void {
        // @ts-ignore - cm exists on editor but is not typed
        const view = editor.cm as EditorView
        if (!view) return
        this.ensureUniqueTaskIdsInView(view)
    }

    public ensureUniqueTaskIdsInView(view: EditorView): boolean {
        // Obsidian Tasks creates a recurring occurrence by copying the complete
        // task line, including our hidden ID. The old implementation removed
        // the copied ID and expected checkForNewTasks() to add another one, but
        // preventDeletion intentionally blocks standalone task-id deletion.
        //
        // Replace the copied ID atomically instead. Replacing the whole line is
        // treated as a normal task edit by the protection filter and guarantees
        // that auto-sync sees the new occurrence with a distinct identity.
        const groups = new Map<string, Array<{
            line: any
            completed: boolean
            match: RegExpMatchArray
        }>>()

        const usedIds = new Set<string>(Object.keys(this.plugin.settings.taskMetadata))

        for (let i = 1; i <= view.state.doc.lines; i++) {
            const line = view.state.doc.line(i)
            const match = line.text.match(/<!-- task-id: ([a-z0-9]+) -->/)
            if (!match) continue

            usedIds.add(match[1])

            const entries = groups.get(match[1]) || []
            entries.push({
                line,
                completed: /^\s*-\s+\[[xX]\]/.test(line.text),
                match
            })
            groups.set(match[1], entries)
        }

        const changes: { from: number; to: number; insert: string }[] = []

        for (const [duplicatedId, entries] of groups) {
            if (entries.length < 2) continue

            // Recurrence creates a completed old occurrence plus an active new
            // occurrence. Preserve the completed occurrence's ID so its existing
            // Google event/metadata remains associated with the task that was
            // actually completed.
            const keeper = entries.find(entry => entry.completed) || entries[0]

            for (const entry of entries) {
                if (entry === keeper) continue

                const freshId = this.generateFreshTaskId(usedIds)
                const newMarker = `<!-- task-id: ${freshId} -->`
                const updatedLine = this.normalizeSyncItemLineForTasksCompatibility(
                    entry.line.text.replace(entry.match[0], newMarker)
                )

                changes.push({
                    from: entry.line.from,
                    to: entry.line.to,
                    insert: updatedLine
                })

                LogUtils.debug(
                    `Reassigned copied recurring task ID ${duplicatedId} -> ${freshId}`
                )
            }
        }

        if (changes.length === 0) return false

        // CodeMirror accepts multiple full-line replacements in document order.
        changes.sort((a, b) => a.from - b.from)
        view.dispatch({ changes })

        LogUtils.debug(`Reassigned ${changes.length} duplicated recurring task ID(s)`)
        return true
    }

    private checkForNewTasks(editor: Editor) {
        // @ts-ignore - cm exists on editor but is not typed
        const view = editor.cm as EditorView
        if (!view) return

        const doc = view.state.doc
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i)
            if (this.isSyncItemLine(line.text) && !line.text.match(this.ID_PATTERN)) {
                LogUtils.debug(`Found new sync item at line ${i}`)
                this.generateTaskId(view, line.from)
            }
        }
    }

    private ensureIdsAfterMarker(editor: Editor) {
        // @ts-ignore - cm exists on editor but is not typed
        const view = editor.cm as EditorView
        if (!view) return
        this.normalizeTaskIdsInView(view)
    }

    /**
     * CodeMirror does not allow EditorView.dispatch() while ViewPlugin.update()
     * is running. Defer hidden-ID normalization until the current update stack
     * has completed, and coalesce nested updates caused by our own dispatches.
     */
    private scheduleViewReconciliation(view: EditorView): void {
        if (this.pendingViewReconciliations.has(view)) return
        this.pendingViewReconciliations.add(view)

        window.setTimeout(() => {
            try {
                this.normalizeTaskIdsInView(view)
                this.ensureUniqueTaskIdsInView(view)
            } catch (error) {
                LogUtils.error(`Deferred editor reconciliation failed: ${error}`)
            } finally {
                this.pendingViewReconciliations.delete(view)
            }
        }, 0)
    }

    public getExtension(): Extension[] {
        const idPattern = this.ID_PATTERN;
        const plugin = this.plugin;
        const controller = this;

        // Create a ViewPlugin to handle task creation in real-time
        const taskCreationPlugin = ViewPlugin.fromClass(class {
            private lastChangeTime = 0;

            constructor(view: EditorView) {
                controller.scheduleViewReconciliation(view);
            }

            update(update: ViewUpdate) {
                if (!update.docChanged) return;

                // Any operation that dispatches a follow-up transaction must
                // happen after this ViewPlugin.update() callback has returned.
                controller.scheduleViewReconciliation(update.view);

                const currentTime = Date.now();
                if (currentTime - this.lastChangeTime < 100) return; // Debounce rapid changes
                this.lastChangeTime = currentTime;

                // Check for new tasks in changed ranges
                update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
                    const doc = update.view.state.doc;
                    const startLine = doc.lineAt(fromB);
                    const endLine = doc.lineAt(toB);

                    for (let pos = startLine.from; pos <= endLine.to;) {
                        const line = doc.lineAt(pos);
                        if (controller.isSyncItemLine(line.text) && !line.text.match(idPattern)) {
                            LogUtils.debug(`Real-time task detection: Found new task at line ${line.number}`);
                            controller.generateTaskId(update.view, line.from);
                        }
                        pos = line.to + 1;
                    }
                });
            }
        });

        const buildTaskIdDecorations = (state: EditorState): DecorationSet => {
            const builder = new RangeSetBuilder<Decoration>()
            const decorations: Array<{
                from: number,
                to: number,
                decoration: Decoration
            }> = []

            for (let pos = 0; pos < state.doc.length;) {
                const line = state.doc.lineAt(pos)
                let match

                idPattern.lastIndex = 0
                while ((match = idPattern.exec(line.text)) !== null) {
                    const from = line.from + match.index
                    const to = from + match[0].length

                    decorations.push({
                        from,
                        to,
                        decoration: Decoration.replace({
                            widget: new ZeroWidthWidget(match[0]),
                            block: false,
                            side: 1
                        })
                    })
                }

                pos = line.to + 1
            }

            decorations.sort((a, b) => a.from - b.from)
            for (const { from, to, decoration } of decorations) {
                builder.add(from, to, decoration)
            }

            return builder.finish()
        }

        const taskIdField = StateField.define<DecorationSet>({
            create(state) {
                // Build replacements immediately when a note is opened. Waiting
                // for the first editor transaction leaves raw task-id comments
                // visible on clients (notably iOS) that do not dispatch an
                // initialization transaction.
                return buildTaskIdDecorations(state)
            },
            update(oldSet, tr) {
                // Only prevent standalone deletion of task IDs
                if (tr.changes.length > 0) {
                    const newDoc = tr.newDoc.toString();
                    const oldDoc = tr.startState.doc.toString();

                    // Get all task lines and their IDs from both states
                    const oldMatches = Array.from(oldDoc.matchAll(/^.*?-\s+(?:\[[ xX]\]\s+|📆\s+).*?(<!-- task-id: [a-z0-9]+ -->)/gm));
                    const newMatches = Array.from(newDoc.matchAll(/^.*?-\s+(?:\[[ xX]\]\s+|📆\s+).*?(<!-- task-id: [a-z0-9]+ -->)/gm));

                    // If we have fewer task IDs but the same number of tasks, prevent the change
                    // This catches standalone ID deletions while allowing task operations
                    if (oldMatches.length === newMatches.length &&
                        oldMatches.length > Array.from(newDoc.matchAll(idPattern)).length) {
                        return oldSet;
                    }
                }

                return buildTaskIdDecorations(tr.state)
            },
            provide: f => EditorView.decorations.from(f)
        })

        // Enhanced atomic ranges to prevent selective deletion of IDs, but allow line deletion
        const atomicRanges = EditorView.atomicRanges.of(view => {
            const builder = new RangeSetBuilder();
            const content = view.state.doc.toString();
            let match;

            // Reset lastIndex to ensure we start from the beginning
            this.ID_PATTERN.lastIndex = 0;

            // First check if this is a large-scale deletion (multiple lines)
            // We don't want to interfere with multi-line deletions or cut operations
            const selection = view.state.selection;
            const hasLargeSelection = selection.ranges.some(range =>
                range.to - range.from > 10 || // More than a few characters
                content.slice(range.from, range.to).includes('\n') // Multi-line selection
            );

            // If there's a large selection active, don't make IDs atomic to allow deletion
            if (hasLargeSelection) {
                return builder.finish();
            }

            while ((match = this.ID_PATTERN.exec(content)) !== null) {
                if (match.index !== undefined) {
                    // Only make task IDs atomic inside task lines - not when selecting whole lines
                    const lineStart = content.lastIndexOf('\n', match.index) + 1;
                    let lineEnd = content.indexOf('\n', match.index);
                    if (lineEnd === -1) lineEnd = content.length;

                    // Check if the line contains a task
                    const line = content.slice(lineStart, lineEnd);
                    const isTaskLine = /^.*?-\s+(?:\[[ xX]\]\s+|📆\s+)/.test(line);

                    // Make the ID atomic only if it's in a task line and not being deleted as part of the whole line
                    if (isTaskLine) {
                        builder.add(
                            match.index,
                            match.index + match[0].length,
                            Decoration.mark({
                                inclusive: false,
                                atomic: true
                            })
                        );
                    }
                }
            }

            return builder.finish();
        });

        // Add transaction filter to prevent ID modifications except in whole task operations
        const preventDeletion = EditorState.transactionFilter.of(tr => {
            if (!tr.changes.length) return tr;

            let changes: { from: number, to: number, insert: string }[] = [];
            let shouldBlock = false;

            tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                const line = tr.startState.doc.lineAt(fromA);
                const taskMatch = line.text.match(/^.*?-\s+(?:\[[ xX]\]\s+|📆\s+).*?(<!-- task-id: [a-z0-9]+ -->)/);
                const insertedText = inserted.toString();

                // Allow complete line deletion (when a line is fully deleted and replaced with nothing)
                // Or when the line is part of a larger deletion (multi-line delete or cut)
                const isLineDeletion =
                    (toA - fromA >= line.length && inserted.length === 0) || // Full line deletion
                    (toA - fromA > 0 && line.text.includes(this.ID_PATTERN.source) && inserted.length === 0); // Partial containing ID

                if (isLineDeletion) {
                    // Handle task deletion logic in background
                    if (taskMatch) {
                        const idMatch = line.text.match(this.ID_PATTERN);
                        if (idMatch && idMatch[1]) {
                            const taskId = idMatch[1];
                            LogUtils.debug(`Task line deletion detected for task ${taskId}`);

                            // Defer remote deletion and verify the item did not
                            // move to another in-scope file (cut/paste, rename, LiveSync).
                            const metadata = this.plugin.settings.taskMetadata[taskId];
                            if (metadata?.filePath) {
                                this.scheduleMissingItemDeletion(taskId, metadata.filePath);
                            }
                        }
                    }
                    return; // Always allow line deletions
                }

                if (taskMatch) {
                    const idIndex = line.text.indexOf('<!-- task-id:');
                    const idStartIndex = idIndex + '<!-- task-id: '.length;
                    const idEndIndex = idIndex + taskMatch[1].length - ' -->'.length;
                    const changeIndex = fromA - line.from;

                    // Check if this is a line break
                    if (insertedText.includes('\n')) {
                        // Only block if breaking within the actual ID
                        if (changeIndex > idStartIndex && changeIndex < idEndIndex) {
                            shouldBlock = true;
                            return;
                        }

                        // For line breaks within task content, let CodeMirror handle naturally
                        // We'll fix the ID position in a post-processing step via normalizeTaskIdsInView
                        // This prevents the character duplication bug caused by conflicting transaction handling

                        // Always allow the line break to proceed naturally
                        return;
                    }

                    // Check if this is a whole task operation
                    const isWholeTaskOperation =
                        // Entire line is being modified
                        (line.text.trim() === tr.startState.sliceDoc(fromA, toA).trim()) ||
                        // New task is being pasted
                        (/^-\s+(?:\[[ xX]\]\s+|📆\s+)/.test(insertedText));

                    // Block if trying to modify just the ID
                    if (!isWholeTaskOperation &&
                        changeIndex > idStartIndex && changeIndex < idEndIndex) {
                        shouldBlock = true;
                        return;
                    }
                }

                // Check for standalone ID deletion (but not if deleting the entire line)
                const deletedText = tr.startState.sliceDoc(fromA, toA);
                if (deletedText.match(this.ID_PATTERN) &&
                    !/^.*?-\s+(?:\[[ xX]\]\s+|📆\s+)/.test(deletedText) &&
                    !/^.*?-\s+(?:\[[ xX]\]\s+|📆\s+)/.test(insertedText) &&
                    !isLineDeletion) {
                    shouldBlock = true;
                    return;
                }
            });

            if (shouldBlock) {
                return [];
            }

            if (changes.length > 0) {
                return [tr, { changes }];
            }

            return tr;
        });

        // Exact @ shortcuts are implemented at the CodeMirror transaction
        // layer so they remain reliable even when Tasks' own EditorSuggest has
        // priority over other suggest popups.
        const calendarShortcutExpander = EditorState.transactionFilter.of(tr => {
            if (!tr.docChanged) return tr

            const replacements: { from: number; to: number; insert: string }[] = []
            const aliases: Record<string, string> = {
                date: '📅 ',
                time: '⏰ ',
                rem: '🔔 ',
                reminder: '🔔 ',
                dur: '⏱',
                duration: '⏱',
                end: '➡️ ',
                event: '📆 '
            }

            tr.changes.iterChanges((_fromA, _toA, _fromB, toB) => {
                const line = tr.newDoc.lineAt(toB)
                if (!/^\s*-/.test(line.text)) return

                const prefix = tr.newDoc.sliceString(line.from, toB)
                const match = prefix.match(/@([a-z]+)$/i)
                if (!match) return

                const key = match[1].toLowerCase()
                const replacement = aliases[key]
                if (!replacement) return

                const atOffset = prefix.length - match[0].length
                const charBefore = atOffset > 0 ? prefix.charAt(atOffset - 1) : ''
                const beforeAt = prefix.slice(0, atOffset)
                const followsCalendarMetadata =
                    /(?:📅\s*\d{4}-\d{2}-\d{2}|⏰\s*\d{1,2}:\d{2}|➡️\s*\d{1,2}:\d{2}|⏱\s*\d+[mh]|🔔\s*\d+[mhd])$/i
                        .test(beforeAt)
                if (charBefore && !/\s/.test(charBefore) && !followsCalendarMetadata) return

                // @event is a line-type shortcut, not task metadata. Only expand
                // it immediately after a plain list marker.
                if (key === 'event' && prefix.slice(0, atOffset).trim() !== '-') return

                const leadingSpace =
                    charBefore && !/\s/.test(charBefore) ? ' ' : ''

                replacements.push({
                    from: line.from + atOffset,
                    to: toB,
                    insert: leadingSpace + replacement
                })
            })

            if (replacements.length === 0) return tr
            return [tr, { changes: replacements, sequential: true }]
        })

        return [
            taskIdField,
            atomicRanges,
            preventDeletion,
            calendarShortcutExpander,
            taskCreationPlugin
        ];
    }

    // Private implementation of generateTaskId
    private _generateTaskId(view: EditorView, pos: number): string {
        try {
            // Generate a time-based ID for better uniqueness
            const id = IdUtils.generateTimeBasedId();
            const now = Date.now();
            const line = view.state.doc.lineAt(pos);
            const file = this.plugin.app.workspace.getActiveFile();
            if (!(file instanceof TFile)) {
                LogUtils.error('No active Markdown file found');
                return '';
            }
            if (!this.plugin.taskParser.isFileInScope(file)) {
                LogUtils.debug(`Skipping task ID generation outside sync scope: ${file.path}`);
                return '';
            }
            LogUtils.debug('Generating ID for calendar-tracked line');
            // Check if line already has an ID
            if (line.text.match(this.ID_PATTERN)) {
                LogUtils.debug('Line already has an ID');
                return '';
            }

            // IDs are shared by checkbox tasks and 📆 informational events.
            if (!this.isSyncItemLine(line.text)) {
                LogUtils.debug('Not a sync item line');
                return '';
            }

            const kind: 'task' | 'event' = /^\s*-\s+📆\s+/.test(line.text) ? 'event' : 'task';

            // Create the task ID
            const taskId = `<!-- task-id: ${id} -->`;

            // Keep the private marker directly after the checkbox (or 📆 event
            // marker). Putting it at the end breaks Obsidian Tasks recurrence
            // parsing because Tasks stops at unknown trailing metadata.
            const anchorMatch =
                line.text.match(/^(\s*-\s+\[[ xX]\])/) ||
                line.text.match(/^(\s*-\s+📆)/);

            if (!anchorMatch) {
                LogUtils.debug('Could not locate task/event marker');
                return '';
            }

            const insertPos = line.from + anchorMatch[1].length;
            const transaction = view.state.update({
                changes: [{
                    from: insertPos,
                    to: insertPos,
                    insert: ` ${taskId}`
                }]
            });
            view.dispatch(transaction);

            // Store metadata about this task
            this.plugin.settings.taskMetadata[id] = {
                createdAt: now,
                lastModified: now,
                lastSynced: now,
                eventId: '', // Will be filled when synced with Google Calendar
                filePath: file.path,
                kind,
                title: line.text
                    .replace(/^\s*- \[[ xX]\]\s*/, '')
                    .replace(/^\s*-\s+📆\s*/, ''),
                date: new Date().toISOString().split('T')[0],
                completed: kind === 'task' && (line.text.indexOf('- [x]') >= 0 || line.text.indexOf('- [X]') >= 0),
            };
            this.plugin.saveSettings();

            LogUtils.debug(`Generated new task ID: ${id}`);

            return id;
        } catch (error) {
            LogUtils.error(`Failed to generate task ID: ${error}`);
            return '';
        }
    }

    // Public method for generating task IDs with controlled debouncing
    // We maintain an internal queue to ensure we process all tasks even under high load
    private taskIdGenQueue: Array<{ view: EditorView, pos: number, time: number }> = [];
    private isProcessingQueue = false;

    private async processTaskIdGenQueue() {
        if (this.isProcessingQueue || this.taskIdGenQueue.length === 0) return;

        try {
            this.isProcessingQueue = true;

            // Sort by time (oldest first)
            this.taskIdGenQueue.sort((a, b) => a.time - b.time);

            // Process up to 5 items at a time
            const batch = this.taskIdGenQueue.splice(0, 5);

            for (const item of batch) {
                try {
                    // Add a small delay before checking to ensure editor state is stable
                    await new Promise(resolve => setTimeout(resolve, 10));

                    const line = item.view.state.doc.lineAt(item.pos);

                    // Only generate ID if line is a task and doesn't already have an ID
                    if (this.isSyncItemLine(line.text) && !line.text.match(this.ID_PATTERN)) {
                        const id = this._generateTaskId(item.view, item.pos);
                        if (id) {
                            LogUtils.debug(`Added ID to new task: ${id}`);
                        }
                    }
                } catch (error) {
                    LogUtils.error(`Error processing task ID generation for item: ${error}`);
                }

                // Increased pause between operations to prevent editor lag and allow
                // previous updates to complete
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        } catch (error) {
            LogUtils.error(`Error processing task ID queue: ${error}`);
        } finally {
            this.isProcessingQueue = false;

            // If more items remain, continue processing after a longer delay
            // to ensure the editor has fully processed previous updates
            if (this.taskIdGenQueue.length > 0) {
                setTimeout(() => this.processTaskIdGenQueue(), 250);
            }
        }
    }

    public generateTaskId = (view: EditorView, pos: number): void => {
        // Add to queue
        this.taskIdGenQueue.push({
            view,
            pos,
            time: Date.now()
        });

        // Start processing if not already doing so
        if (!this.isProcessingQueue) {
            this.processTaskIdGenQueue();
        }
    }

    public getTaskId(state: EditorState, pos: number): string | null {
        try {
            const line = state.doc.lineAt(pos)
            // For single match operations, create a non-global version of the pattern
            const singleMatchPattern = /<!-- task-id: ([a-z0-9]+) -->/
            const match = line.text.match(singleMatchPattern)
            return match ? match[1] : null
        } catch (error) {
            LogUtils.error(`Error getting task ID: ${error}`)
            return null
        }
    }

    public debugIds(state: EditorState) {
        LogUtils.debug('Task IDs in document:')
        const lines = state.doc.toString().split('\n')
        lines.forEach((line, index) => {
            const match = line.match(this.ID_PATTERN)
            if (match) {
                LogUtils.debug(`Line ${index + 1}: ID ${match[1]}`)
            }
        })
    }
}
