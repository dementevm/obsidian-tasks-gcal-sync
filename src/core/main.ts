import { Plugin, Notice, Menu, MenuItem, Editor, TFile, TAbstractFile, MarkdownView } from 'obsidian';
import { GoogleAuthManager } from '../calendar/googleAuth';
import { TaskParser } from '../tasks/taskParser';
import { CalendarSync } from '../calendar/calendarSync';
import { RepairManager } from '../repair/repairManager';
import { GoogleCalendarSettingsTab, DEFAULT_SETTINGS } from './settings';
import type { GoogleCalendarSettings, Task } from './types';
import { TIMING } from '../config/constants';
import { useStore, type TaskStore } from './store';
import debounce from 'just-debounce-it';
import { MetadataManager } from '../metadata/metadataManager';
import { TokenController } from '../tasks/TokenController';
import { CalendarTokenSuggest } from '../tasks/CalendarTokenSuggest';
import { LogUtils } from '../utils/logUtils';
import { hasTaskChanged } from '../utils/taskUtils';
import { initializeStore } from './store';
import { Platform } from 'obsidian';
import { ReminderModal } from '../ui/ReminderModal';
import { DiagnosticsModal } from '../ui/DiagnosticsModal';
import { applyShareableSetup, createSetupLink, decodeSetup } from '../utils/setupTransfer';

export default class GoogleCalendarSyncPlugin extends Plugin {
    settings: GoogleCalendarSettings;
    public metadataManager: MetadataManager | null = null;
    public authManager: GoogleAuthManager | null = null;
    public calendarSync: CalendarSync | null = null;
    public repairManager: RepairManager | null = null;
    public taskParser: TaskParser;
    public tokenController: TokenController;
    private statusBarItem: HTMLElement | null = null;
    private ribbonIcon: HTMLElement | null = null;
    private unsubscribeStore: (() => void) | undefined = undefined;
    private lastContent: string[] = [];
    private cleanupInterval: number | null = null;
    public mobileAuthInitiated: boolean = false;

    async onload() {
        try {
            console.log('Loading Google Calendar Sync plugin...');

            // Load settings first
            await this.loadSettings();

            // Always disable welcome modal
            // Note: saveSettings() removed here - settings will be saved later when needed
            this.settings.hasCompletedOnboarding = true;

            // Initialize LogUtils
            LogUtils.initialize(this);

            // Initialize store with plugin instance early so it's ready for any state updates
            // This must happen before auth operations that may need to update store state
            initializeStore(this);

            // Initialize TaskParser first
            this.taskParser = new TaskParser(this);

            // SecretStorage is already vault-scoped by Obsidian.
            this.authManager = new GoogleAuthManager(this);

            // Register protocol handler for mobile OAuth
            this.registerObsidianProtocolHandler('auth/gcalsync', async (params) => {
                if (this.authManager) {
                    try {
                        console.log('Received protocol callback (parameters redacted for security)');

                        if (!params.code) {
                            throw new Error('Missing authorization code in callback parameters');
                        }

                        await this.authManager.handleProtocolCallback(params);

                        // Successfully authenticated, show success message
                        console.log('🔐 Successfully completed authentication via protocol handler');
                        new Notice('Successfully connected to Google Calendar!');

                        // Set authentication state before initializing calendar sync
                        useStore.getState().setAuthenticated(true);

                        // Also update the UI status immediately to reflect authenticated state
                        useStore.getState().setStatus('connected');
                        this.updateRibbonStatus('connected');

                        // Initialize calendar sync after authentication is complete
                        await this.initializeCalendarSync();
                    } catch (error) {
                        console.error('Error handling protocol callback:', error);

                        // Provide more specific error messages based on error type
                        let errorMessage = 'Authentication failed. Please try connecting again.';

                        if (error instanceof Error) {
                            if (error.message.includes('network')) {
                                errorMessage = 'Network error during authentication. Check your internet connection and try again.';
                            } else if (error.message.includes('invalid_grant')) {
                                errorMessage = 'Invalid authorization. Please try authenticating again.';
                            } else if (error.message.includes('access_denied')) {
                                errorMessage = 'Access was denied. Please grant all required permissions when authenticating.';
                            } else if (error.message.includes('Missing authorization code')) {
                                errorMessage = 'Missing authorization data. Please complete the full authentication process.';
                            }
                        }

                        // Show a specific error notice that gives clearer instruction
                        new Notice(errorMessage, 10000); // Show for 10 seconds for better visibility

                        // Update UI state
                        useStore.getState().setAuthenticated(false);
                        useStore.getState().setStatus('error', error instanceof Error ? error : new Error(String(error)));
                    }
                }
            });

            this.registerObsidianProtocolHandler('tasks-gcal-sync/setup', async (params) => {
                try {
                    if (!params.data) throw new Error('Setup link is missing configuration data.');
                    const setup = decodeSetup(params.data);
                    const scope = setup.scanEntireVault
                        ? 'Entire vault'
                        : (setup.includeFolders.join(', ') || 'No folders');

                    const confirmed = window.confirm(
                        'Import Google Calendar Sync settings?\n\n' +
                        `Calendar: ${setup.calendarId || 'not configured'}\n` +
                        `Scope: ${scope}\n\n` +
                        'OAuth secrets and refresh tokens are NOT contained in this link. ' +
                        'Auto-sync will remain OFF after import.'
                    );
                    if (!confirmed) return;

                    this.settings = applyShareableSetup(this.settings, setup);
                    useStore.getState().setSyncEnabled(false);
                    await this.saveSettings();
                    new Notice('Calendar sync settings imported. Configure this device\'s SecretStorage and reconnect Google if needed.', 10000);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Failed to import setup link: ${message}`, 10000);
                }
            });

            try {
                await this.authManager.loadSavedTokens();
            } catch (e) {
                console.error('Failed to load saved tokens, clearing authentication state:', e);

                // Log specific error for debugging
                if (e instanceof Error) {
                    LogUtils.error(`Token loading error: ${e.message}`);
                }

                if (this.settings.oauth2Tokens) {
                    this.settings.oauth2Tokens = undefined;
                    await this.saveSettings();
                    LogUtils.debug('Cleared invalid OAuth tokens from settings');
                }
            }

            // Check if tokens are actually valid by proper verification
            let isAuthenticated = this.authManager.isAuthenticated();

            // On mobile especially, we need to verify tokens are actually valid
            // Defer this validation to after load completes to avoid blocking startup
            if (isAuthenticated && Platform.isMobile) {
                setTimeout(async () => {
                    console.log('Performing additional token validation on mobile');
                    try {
                        // This will try to refresh if needed
                        await this.authManager?.getValidAccessToken();
                        LogUtils.debug('Mobile token validation successful');
                    } catch (e) {
                        console.error('Token validation failed on mobile, clearing auth state:', e);

                        // Provide more specific logging based on error type
                        if (e instanceof Error) {
                            if (e.message.includes('expired')) {
                                LogUtils.error('Token expired and refresh failed');
                            } else if (e.message.includes('network')) {
                                LogUtils.error('Network error during token validation');
                            } else {
                                LogUtils.error(`Token validation error: ${e.message}`);
                            }
                        }

                        // Update authentication state
                        useStore.getState().setAuthenticated(false);
                        useStore.getState().setStatus('disconnected');
                        if (this.settings.oauth2Tokens) {
                            this.settings.oauth2Tokens = undefined;
                            await this.saveSettings();
                        }

                        // Notify user about authentication issue
                        new Notice('Authentication issue detected. Please reconnect to Google Calendar.', 8000);
                    }
                }, 100);
            }

            // Initialize metadata manager
            this.metadataManager = new MetadataManager(this);

            // Initialize store with complete initial state
            useStore.setState({
                syncEnabled: this.settings.syncEnabled,
                authenticated: isAuthenticated,
                status: isAuthenticated ? 'connected' : 'disconnected',
                tempSyncEnableCount: 0,
                error: null,
                processingTasks: new Set(),
                taskVersions: new Map(),
                locks: new Set(),
                lockTimeouts: new Map(),
                lastSyncTime: null,
                syncInProgress: false,
                syncQueue: new Set(),
                failedSyncs: new Map(),
                plugin: this
            });

            // Initialize UI components
            this.initializeStatusBar();
            this.ribbonIcon = this.initializeRibbonIcon();

            // Initialize TokenController
            this.tokenController = new TokenController(this);

            // Older plugin versions wrote <!-- task-id --> at the end of the
            // line. Move existing IDs before Obsidian Tasks metadata before
            // auto-sync handlers start observing file changes.
            await this.tokenController.migrateTaskIdsForTasksCompatibility();

            const extension = this.tokenController.getExtension();
            this.registerEditorExtension([extension]);

            // Calendar metadata autocomplete: @event, @time, @rem, @dur, etc.
            this.registerEditorSuggest(new CalendarTokenSuggest(this.app));

            this.addCommand({
                id: 'create-calendar-reminder',
                name: 'Create calendar reminder',
                editorCallback: (editor) => new ReminderModal(this.app, this, editor).open()
            });
            this.addCommand({
                id: 'google-calendar-sync-now',
                name: 'Google Calendar: Sync now',
                callback: () => { void this.syncNow(); }
            });
            this.addCommand({
                id: 'google-calendar-diagnostics',
                name: 'Google Calendar: Open diagnostics',
                callback: () => new DiagnosticsModal(this.app, this).open()
            });
            this.addCommand({
                id: 'google-calendar-copy-setup-link',
                name: 'Google Calendar: Copy setup link',
                callback: () => { void this.copySetupLink(); }
            });

            // Initialize UI state
            this.updateRibbonStatus(useStore.getState().status);

            // Subscribe to store changes - wrapped in try-catch to prevent errors from causing issues
            this.unsubscribeStore = useStore.subscribe((state) => {
                try {
                    this.updateRibbonStatus(state.status);
                    this.updateStatusBar();
                } catch (error) {
                    LogUtils.error('Error in store subscription:', error);
                }
            });

            // Initialize calendar sync if authenticated
            // Defer until after onload() completes to avoid blocking startup
            if (isAuthenticated) {
                setTimeout(() => this.initializeCalendarSync(), 0);
            }

            // Register event handlers
            this.registerEventHandlers();

            // Start periodic cleanup
            this.startPeriodicCleanup();

            // NOTE: File change monitoring is handled in registerEventHandlers()
            // with proper debouncing to prevent double-syncing

            LogUtils.debug('Plugin loaded successfully');
        } catch (error) {
            LogUtils.error('Failed to load plugin:', error);
            useStore.getState().setStatus('error', error instanceof Error ? error : new Error(String(error)));
        }
    }

    private registerEventHandlers() {
        // Register file change events with shorter debounce
        this.registerEvent(
            this.app.vault.on('modify',
                debounce(async (file: TFile) => {
                    if (!useStore.getState().isSyncAllowed()) return;
                    if (!file.path.endsWith('.md')) return;
                    if (!this.taskParser.isFileInScope(file)) return;

                    try {
                        // Reading mode updates the Markdown file without a
                        // CodeMirror editor transaction. Repair recurring IDs
                        // before this handler is allowed to parse/enqueue tasks.
                        if (await this.tokenController.repairTaskIdsInFile(file)) {
                            useStore.getState().invalidateFileCache(file.path);
                            LogUtils.debug(`Deferred calendar sync until recurring IDs were repaired in ${file.path}`);
                            return;
                        }

                        // Get the file content
                        const state = useStore.getState();
                        state.invalidateFileCache(file.path);
                        const content = await state.getFileContent(file.path);

                        // Find all task lines in the file
                        const lines = content.split('\n');
                        const taskLines = lines.filter(line => this.taskParser.isTaskLine(line));

                        if (taskLines.length === 0) return;

                        // Parse tasks from task lines only
                        const tasks = [];
                        for (const line of taskLines) {
                            const task = await this.taskParser.parseTask(line, file.path);
                            if (task && task.id) {
                                tasks.push(task);
                            }
                        }

                        if (tasks.length === 0) return;

                        // Filter out tasks that were just synced
                        const tasksToQueue = [];

                        for (const task of tasks) {
                            if (!task.id) continue;

                            // Check for just synced tasks and skip them
                            const metadata = state.plugin.settings.taskMetadata?.[task.id];
                            // Completion is state-changing and must never be
                            // suppressed by the anti-duplicate cooldown: a skipped
                            // completed occurrence leaves its old calendar event behind.
                            if (!task.completed && metadata?.justSynced && metadata.syncTimestamp) {
                                const syncAge = Date.now() - metadata.syncTimestamp;
                                if (syncAge < TIMING.JUST_SYNCED_WINDOW_MS) { // Use a longer window (2 seconds)
                                    LogUtils.debug(`Task ${task.id} was just synced ${syncAge}ms ago, skipping (file handler)`);
                                    continue;
                                }
                            }

                            // Only queue if not locked
                            if (!state.isTaskLocked(task.id)) {
                                tasksToQueue.push(task);
                            }
                        }

                        // Enqueue all tasks at once
                        if (tasksToQueue.length > 0) {
                            await state.enqueueTasks(tasksToQueue);
                        }
                    } catch (error) {
                        LogUtils.error(`Failed to process file changes for ${file.path}:`, error);
                    }
                }, TIMING.FILE_CHANGE_DEBOUNCE_MS) // Reduced to 1 second for more responsive sync
            )
        );

        // Register settings tab
        this.addSettingTab(new GoogleCalendarSettingsTab(this.app, this));

        // Register file menu events
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file: TAbstractFile) => {
                if (!(file instanceof TFile) || !file.path.endsWith('.md')) return;

                menu.addItem((item) => {
                    item
                        .setTitle('Sync Tasks with Google Calendar')
                        .setIcon('calendar-clock')
                        .onClick(async () => {
                            const state = useStore.getState();
                            try {
                                state.enableTempSync();
                                state.clearTaskCache();
                                state.invalidateFileCache(file.path);
                                await this.tokenController.repairTaskIdsInFile(file);
                                state.invalidateFileCache(file.path);
                                for (const metadata of Object.values(this.settings.taskMetadata)) {
                                    metadata.justSynced = false;
                                }
                                const tasks = await this.taskParser.parseTasksFromFile(file);
                                await state.enqueueTasks(tasks.filter(t => t?.id));
                                await state.processSyncQueueNow();
                                state.endSync(true);
                                new Notice('Tasks synced with Google Calendar');
                            } catch (error) {
                                const syncError = error instanceof Error ? error : new Error(String(error));
                                LogUtils.error(`Failed to sync tasks from ${file.path}:`, syncError);
                                state.endSync(false);
                                new Notice(`Sync failed: ${syncError.message}`, 10000);
                            } finally {
                                state.disableTempSync();
                            }
                        });
                });
            })
        );

        // Register editor change events for auto-sync with improved batching
        this.registerEvent(
            this.app.workspace.on('editor-change',
                debounce(async (editor: Editor) => {
                    if (!useStore.getState().isSyncAllowed()) return;

                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view || !view.file) return;

                    // Check if the cursor is on a task line
                    const cursorPos = editor.getCursor();
                    const currentLine = editor.getLine(cursorPos.line);

                    // Only proceed if the current line is a task line
                    if (!this.taskParser.isTaskLine(currentLine)) {
                        return;
                    }

                    const state = useStore.getState();
                    if (state.syncInProgress) {
                        LogUtils.debug('Sync in progress, will retry after current sync');
                        setTimeout(() => {
                            if (view.file) {
                                this.processEditorChanges(view.file);
                            }
                        }, 500); // Reduced retry time to 500ms
                        return;
                    }

                    if (view.file) {
                        await this.processEditorChanges(view.file);
                    }
                }, TIMING.EDITOR_CHANGE_DEBOUNCE_MS) // Reduced to 500ms for more responsive sync
            )
        );
    }

    private async processEditorChanges(file: TFile) {
        const state = useStore.getState();
        try {
            // First check if we can read the file
            try {
                // Force fresh content read
                await state.invalidateFileCache(file.path);
                await state.getFileContent(file.path);
            } catch (fileError) {
                LogUtils.error(`Failed to read file ${file.path} during editor changes:`, fileError);
                return; // Exit early if we can't read the file
            }

            // Get the current cursor position and line
            const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
            if (!editor) return;

            const cursorPos = editor.getCursor();
            const currentLine = editor.getLine(cursorPos.line);

            // Only process the task at the current line
            if (this.taskParser.isTaskLine(currentLine)) {
                const task = await this.taskParser.parseTask(currentLine, file.path);

                if (task && task.id) {
                    // Get metadata to check if task has changed
                    const metadata = this.settings.taskMetadata[task.id];
                    const result = hasTaskChanged(task, metadata, task.id);
                    const hasChanged = result.changed;

                    if (hasChanged) {
                        // Additional check for recently synced tasks
                        if (!task.completed && metadata?.justSynced && metadata.syncTimestamp) {
                            const syncAge = Date.now() - metadata.syncTimestamp;
                            if (syncAge < 2500) { // Even longer window for editor changes
                                LogUtils.debug(`Task ${task.id} was just synced ${syncAge}ms ago, skipping editor handler`);
                                return; // Skip completely
                            }
                        }

                        LogUtils.debug(`Task ${task.id} has changed, enqueueing for sync`);

                        // Process non-locked task immediately
                        if (!state.isTaskLocked(task.id)) {
                            await state.enqueueTasks([task]);

                            // Trigger immediate sync to process the task
                            await state.processSyncQueueNow();
                        } else {
                            // If task is locked, add to queue for later processing
                            LogUtils.debug(`Task ${task.id} is locked, adding to sync queue for later processing`);
                            state.addToSyncQueue(task.id);
                        }
                    } else {
                        LogUtils.debug(`Task ${task.id} has not changed, skipping enqueue`);
                    }
                }
            }
        } catch (error) {
            LogUtils.error(`Failed to process editor changes for ${file.path}:`, error);
        }
    }

    public async handleTaskDeletion(
        taskId: string,
        eventId: string | undefined,
        force = false
    ): Promise<void> {
        const { isTaskLocked, isSyncEnabled, addProcessingTask, removeProcessingTask } = useStore.getState();

        if (isTaskLocked(taskId)) {
            LogUtils.debug(`Task ${taskId} is locked, skipping deletion`);
            return;
        }

        if (!force && !isSyncEnabled()) {
            LogUtils.debug(`🔒 Sync is disabled, deferring deletion handling for ${taskId}`);
            return;
        }

        try {
            addProcessingTask(taskId);
            if (eventId) {
                if (!this.calendarSync) {
                    throw new Error('Calendar sync is not initialized; keeping metadata for retry.');
                }
                LogUtils.debug(`Deleting calendar event: ${eventId}`);
                await this.calendarSync.deleteEvent(eventId);
                LogUtils.debug(`Successfully deleted event: ${eventId}`);
            }

            // Metadata is removed only after the remote delete succeeds (or when
            // there was no remote event). This keeps failed deletes retryable.
            await this.metadataManager?.removeTaskMetadata(taskId);
            LogUtils.debug('Cleaned up task metadata');
        } catch (error) {
            LogUtils.error(`Failed to delete calendar item for ${taskId}; metadata retained:`, error);
            throw error;
        } finally {
            removeProcessingTask(taskId);
        }
    }

    public async initializeCalendarSync() {
        if (!this.authManager) return;

        try {
            // Verify authentication before proceeding, skip prompt if we're coming from protocol handler
            const isAuthenticatedFromHandler = useStore.getState().authenticated;
            if (!await this.verifyAuthentication(isAuthenticatedFromHandler)) {
                useStore.getState().setStatus('disconnected');
                console.log('Authentication verification failed, not initializing calendar sync');
                return;
            }

            this.calendarSync = new CalendarSync(this);
            await this.calendarSync.initialize();

            // Initialize repair manager if needed
            if (!this.repairManager) {
                this.repairManager = new RepairManager(this);
            }

            // Skip initial cleanup on load - only do this during manual repair
            LogUtils.debug('Skipping initial cleanup during load');
            useStore.getState().setStatus('connected');
        } catch (error) {
            LogUtils.error('Failed to initialize calendar sync:', error);
            useStore.getState().setStatus('error', error instanceof Error ? error : new Error(String(error)));

            // Check if this is an auth error and handle appropriately
            if (error instanceof Error &&
                (error.message.includes('Authentication') ||
                    error.message.includes('auth') ||
                    error.message.includes('401'))) {
                console.log('Auth-related error detected, marking as disconnected');
                useStore.getState().setStatus('disconnected');
                useStore.getState().setAuthenticated(false);

                // Clear invalid tokens on auth errors
                if (this.settings.oauth2Tokens) {
                    this.settings.oauth2Tokens = undefined;
                    await this.saveSettings();
                }
            }
        }
    }

    private startPeriodicCleanup() {
        // Run cleanup every 5 minutes
        this.cleanupInterval = window.setInterval(() => {
            useStore.getState().clearStaleProcessingTasks();
        }, TIMING.PERIODIC_CLEANUP_INTERVAL_MS);
    }

    private async getAllTasks(): Promise<Task[]> {
        const tasks: Task[] = [];
        const files = this.app.vault.getMarkdownFiles();

        for (const file of files) {
            if (this.settings.includeFolders.length > 0 &&
                !this.settings.includeFolders.some(folder => file.path.startsWith(folder))) {
                continue;
            }
            try {
                const fileTasks = await this.taskParser.parseTasksFromFile(file);
                tasks.push(...fileTasks);
            } catch (error) {
                LogUtils.error(`Failed to parse tasks from ${file.path}:`, error);
            }
        }
        return tasks;
    }

    async onunload() {
        try {
            console.log('🔄 Unloading Google Calendar Sync plugin...');

            // Clear periodic cleanup interval to prevent memory leak
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }

            // Clean up any pending sync operations
            useStore.getState().clearSyncQueue();

            // Clean up metadata
            if (this.metadataManager) {
                await this.metadataManager.cleanup();
            }

            // Clean up UI elements
            if (this.statusBarItem) {
                this.statusBarItem.remove();
            }

            if (this.ribbonIcon) {
                this.ribbonIcon.remove();
                this.ribbonIcon = null;
            }

            // Clean up store subscription
            if (this.unsubscribeStore) {
                this.unsubscribeStore();
            }

            // Clean up auth and sync components
            if (this.authManager) {
                await this.authManager.cleanup();
            }

            // Clear references
            this.calendarSync = null;
            this.authManager = null;
            this.metadataManager = null;
            this.statusBarItem = null;

            // Reset store state last
            useStore.getState().reset();

            console.log('Plugin cleanup completed');
        } catch (error) {
            console.error('❌ Error during plugin cleanup:', error);
        }
    }

    async loadSettings() {
        const storedSettings = await this.loadData() || {};
        this.settings = Object.assign({}, DEFAULT_SETTINGS, storedSettings);

        // v2 changed personal-workflow defaults during initial smoke testing.
        if ((storedSettings.settingsSchemaVersion ?? 0) < 2) {
            if (storedSettings.defaultEventDurationMinutes === undefined ||
                storedSettings.defaultEventDurationMinutes === 30) {
                this.settings.defaultEventDurationMinutes = 5;
            }
            this.settings.defaultMorningEventTime =
                storedSettings.defaultMorningEventTime || '09:00';
        }

        // v3 makes scope/calendar safety explicit and splits reminder profiles.
        if ((storedSettings.settingsSchemaVersion ?? 0) < 3) {
            this.settings.scanEntireVault = storedSettings.scanEntireVault ?? false;
            this.settings.defaultTimedTaskReminderMinutes =
                storedSettings.defaultTimedTaskReminderMinutes ??
                storedSettings.defaultReminder ??
                30;
            this.settings.defaultInformationalEventReminderMinutes =
                storedSettings.defaultInformationalEventReminderMinutes ?? 0;
            this.settings.allDayTaskRemindersEnabled =
                storedSettings.allDayTaskRemindersEnabled ?? false;
            this.settings.defaultAllDayTaskReminderMinutes =
                storedSettings.defaultAllDayTaskReminderMinutes ?? 0;

            // Never infer consent to mutate the primary calendar.
            if (this.settings.calendarId === 'primary') {
                this.settings.primaryCalendarConfirmed = false;
            }
        }

        if (!this.settings.vaultSecretNamespace) {
            const generated = typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            this.settings.vaultSecretNamespace = generated;
        }

        this.settings.settingsSchemaVersion = 3;
        await this.saveSettings();

        // One-time migration from the upstream plugin, where the OAuth client
        // secret could be stored directly in data.json.
        if (this.settings.clientSecret) {
            const migratedSecretName = 'obsidian-tasks-gcal-sync-client-secret';
            this.app.secretStorage.setSecret(migratedSecretName, this.settings.clientSecret);
            this.settings.clientSecretName = migratedSecretName;
            this.settings.clientSecret = undefined;
            await this.saveSettings();
            LogUtils.debug('Migrated legacy OAuth client secret to SecretStorage');
        }

        // Never keep legacy OAuth token copies in data.json. Users migrating
        // from upstream authenticate once again into device-local SecretStorage.
        if (this.settings.oauth2Tokens ||
            this.settings.encryptedOAuth2Tokens ||
            this.settings.tokensEncrypted) {
            this.settings.oauth2Tokens = undefined;
            this.settings.encryptedOAuth2Tokens = undefined;
            this.settings.tokensEncrypted = false;
            await this.saveSettings();
        }
    }

    private initializeRibbonIcon() {
        return this.addRibbonIcon('calendar-clock', 'Google Calendar Sync', (e: MouseEvent) => {
            // Check both the authManager and the store state
            const storeAuthenticated = useStore.getState().authenticated;
            const authManagerAuthenticated = this.authManager?.isAuthenticated() || false;

            if (!storeAuthenticated && !authManagerAuthenticated) {
                this.authManager?.authorize();
            } else {
                this.showSyncMenu(e);
            }
        });
    }

    private updateRibbonStatus(status: TaskStore['status']): void {
        if (!this.ribbonIcon) return;

        // Remove existing classes
        this.ribbonIcon.removeClass('is-connected', 'is-syncing', 'is-error', 'is-disconnected');

        // Add new class and tooltip
        switch (status) {
            case 'connected':
                this.ribbonIcon.addClass('is-connected');
                this.ribbonIcon.setAttribute('aria-label', 'Connected to Google Calendar');
                break;
            case 'syncing':
                this.ribbonIcon.addClass('is-syncing');
                this.ribbonIcon.setAttribute('aria-label', 'Syncing with Google Calendar...');
                break;
            case 'error':
                this.ribbonIcon.addClass('is-error');
                this.ribbonIcon.setAttribute('aria-label', 'Google Calendar Sync Error');
                break;
            case 'disconnected':
            default:
                this.ribbonIcon.addClass('is-disconnected');
                this.ribbonIcon.setAttribute('aria-label', 'Connect to Google Calendar (click to connect)');
        }
    }

    public updateStatusBar() {
        if (!this.statusBarItem) return;

        const state = useStore.getState();
        let text = '';
        let tooltip = '';

        switch (state.status) {
            case 'connected':
                if (state.syncInProgress) {
                    text = '🔄 GCal: Syncing...';
                    tooltip = `Syncing tasks with Google Calendar (${state.syncQueue.size} remaining)`;
                } else {
                    text = state.syncEnabled ? '🟢 GCal: Auto-sync On' : '🟡 GCal: Ready';
                    tooltip = state.syncEnabled ? 'Auto-sync is enabled' : 'Auto-sync is paused';
                    if (state.lastSyncTime) {
                        tooltip += ` (Last sync: ${new Date(state.lastSyncTime).toLocaleTimeString()})`;
                    }
                }
                break;
            case 'syncing':
                text = '🔄 GCal: Syncing...';
                tooltip = `Syncing tasks with Google Calendar (${state.syncQueue.size} remaining)`;
                break;
            case 'disconnected':
                text = '⚪ GCal: Disconnected';
                tooltip = 'Click to connect to Google Calendar';
                break;
            case 'error':
                text = '🔴 GCal: Error';
                tooltip = state.error?.message || 'An error occurred';
                if (state.failedSyncs.size > 0) {
                    tooltip += ` (${state.failedSyncs.size} failed tasks)`;
                }
                break;
            case 'refreshing_token':
                text = '🔄 GCal: Refreshing...';
                tooltip = 'Refreshing authentication token';
                break;
        }

        this.statusBarItem.setText(text);
        this.statusBarItem.setAttr('aria-label', tooltip);
        this.statusBarItem.setAttr('aria-label-position', 'top');
    }

    private initializeStatusBar() {
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass('gcal-sync-status');
        this.statusBarItem.onClickEvent((event: MouseEvent) => {
            if (!this.authManager?.isAuthenticated()) {
                this.authManager?.authorize();
            } else {
                this.showSyncMenu(event);
            }
        });
        this.updateStatusBar();
    }

    private showSyncMenu(event: MouseEvent) {
        const menu = new Menu();

        menu.addItem((item: MenuItem) => {
            item
                .setTitle("Sync Now")
                .setIcon("sync")
                .onClick(() => this.syncAllTasks());
        });

        menu.addItem((item: MenuItem) => {
            const syncEnabled = useStore.getState().syncEnabled;
            item
                .setTitle(syncEnabled ? "Disable Auto-sync" : "Enable Auto-sync")
                .setIcon(syncEnabled ? "toggle-left" : "toggle-right")
                .onClick(async () => {
                    const newState = !syncEnabled;
                    useStore.getState().setSyncEnabled(newState);
                    // Update plugin settings
                    this.settings.syncEnabled = newState;
                    await this.saveSettings();
                    this.updateStatusBar();
                    new Notice(`Auto-sync ${newState ? 'enabled' : 'disabled'}`);
                });
        });

        menu.addItem((item: MenuItem) => {
            item
                .setTitle('Diagnostics')
                .setIcon('activity')
                .onClick(() => new DiagnosticsModal(this.app, this).open());
        });

        menu.addItem((item: MenuItem) => {
            item
                .setTitle('Clean Orphaned Calendar Items…')
                .setIcon('trash-2')
                .onClick(() => { void this.cleanupOrphansWithConfirmation(); });
        });

        menu.addItem((item: MenuItem) => {
            item
                .setTitle('Repair Calendar Sync…')
                .setIcon('tool')
                .onClick(async () => {
                    if (!this.repairManager) {
                        new Notice('Repair manager not initialized');
                        return;
                    }
                    const confirmed = window.confirm(
                        'Repair may update, create, deduplicate, and delete Obsidian-managed calendar events. ' +
                        'It is not run automatically. Continue?'
                    );
                    if (!confirmed) return;

                    try {
                        new Notice('Starting repair process...');
                        await this.repairManager.repairSyncState(
                            (progress) => console.log(`Repair progress: ${progress.phase} - ${progress.processedItems}/${progress.totalItems}`)
                        );
                        new Notice('Repair completed successfully');
                    } catch (error) {
                        console.error('Repair failed:', error);
                        new Notice('Repair failed. Check diagnostics/console for details.');
                    }
                });
        });

        menu.addItem((item: MenuItem) => {
            item
                .setTitle("Disconnect Google Calendar")
                .setIcon("log-out")
                .onClick(() => this.disconnectGoogle());
        });

        // Show menu at the click position
        menu.showAtPosition({
            x: event.x,
            y: event.y
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private async syncAllTasks() {
        const state = useStore.getState();
        if (state.syncInProgress) {
            console.log('🔄 Sync already in progress');
            return;
        }

        try {
            this.validateSyncConfiguration();
            state.enableTempSync();

            // Explicit removals from existing files are safe to process here.
            // Generic orphan cleanup is intentionally NOT part of Sync Now.
            await this.cleanupExplicitlyRemovedItems();

            // Manual Sync Now is an explicit force-sync. Clear transient anti-duplicate
            // markers and caches so a rapid second edit is never ignored.
            state.clearTaskCache();
            state.clearFileCache();
            for (const metadata of Object.values(this.settings.taskMetadata)) {
                metadata.justSynced = false;
            }

            // Get all tasks from fresh file contents. Do not call startSync() here:
            // processSyncQueue() owns syncInProgress and will set/reset it atomically.
            const tasks = await this.taskParser?.getAllTasks() || [];
            console.log(`Found ${tasks.length} tasks to sync`);

            // Enqueue all tasks and process immediately
            await state.enqueueTasks(tasks);
            await state.processSyncQueueNow();

            await this.saveSettings();
            state.endSync(true);
            new Notice('Tasks synced with Google Calendar');
            console.log('✅ Full sync completed');
        } catch (error) {
            console.error('❌ Sync failed:', error);
            const syncError = error instanceof Error ? error : new Error(String(error));
            state.endSync(false);
            state.setStatus('error', syncError);
            new Notice(`Sync failed: ${syncError.message}`, 10000);
        } finally {
            state.disableTempSync();
        }
    }

    public async syncNow(): Promise<void> {
        await this.syncAllTasks();
    }

    public async testCalendarConnection(): Promise<void> {
        this.validateSyncConfiguration();
        if (!this.calendarSync) throw new Error('Calendar sync is not initialized.');
        await this.calendarSync.testConnection();
    }

    public getSetupLink(): string {
        return createSetupLink(this.settings);
    }

    public async copySetupLink(): Promise<void> {
        const link = this.getSetupLink();
        await navigator.clipboard.writeText(link);
        new Notice('Secret-free setup link copied.');
    }

    public async cleanupOrphansWithConfirmation(): Promise<void> {
        this.validateSyncConfiguration();
        if (!this.repairManager) throw new Error('Repair manager not initialized.');
        const preview = await this.repairManager.previewOrphanCleanup();

        if (preview.orphanEvents === 0 &&
            preview.orphanMetadata === 0 &&
            preview.duplicateEvents === 0) {
            new Notice('No orphaned or duplicate calendar items found.');
            return;
        }

        const scope = this.settings.scanEntireVault
            ? 'entire vault'
            : this.settings.includeFolders.join(', ');

        const confirmed = window.confirm(
            'Clean Obsidian-managed orphaned calendar items?\n\n' +
            `Scope: ${scope || 'none'}\n` +
            `Active items: ${preview.activeItems}\n` +
            `Orphan calendar events: ${preview.orphanEvents}\n` +
            `Orphan metadata records: ${preview.orphanMetadata}\n` +
            `Duplicate events: ${preview.duplicateEvents}\n\n` +
            'This is destructive and is never run automatically.'
        );
        if (!confirmed) return;

        await this.repairManager.cleanupOrphansExplicitly();
        new Notice('Orphan cleanup completed.');
    }

    private validateSyncConfiguration(): void {
        const calendarId = this.settings.calendarId?.trim();
        if (!calendarId) {
            throw new Error('Calendar ID is not configured.');
        }
        if (calendarId === 'primary' && !this.settings.primaryCalendarConfirmed) {
            throw new Error('Primary calendar must be explicitly confirmed in settings.');
        }
        if (!this.settings.scanEntireVault) {
            if (!this.settings.includeFolders.length) {
                throw new Error('Choose folders to sync or explicitly enable Scan Entire Vault.');
            }
            if (this.taskParser.getFilteredFiles().length === 0) {
                throw new Error('No configured sync folders/files were found.');
            }
        }
    }

    private async cleanupExplicitlyRemovedItems(): Promise<void> {
        const scopedFiles = this.taskParser.getFilteredFiles();
        const itemLocations = new Map<string, { file: TFile; line: string }>();

        for (const file of scopedFiles) {
            const content = await this.app.vault.read(file);
            for (const line of content.split('\n')) {
                const idMatch = line.match(/<!-- task-id: ([a-z0-9]+) -->/);
                if (idMatch) itemLocations.set(idMatch[1], { file, line });
            }
        }

        for (const [taskId, metadata] of Object.entries(this.settings.taskMetadata)) {
            const location = itemLocations.get(taskId);

            if (location) {
                // The item still exists but lost 📅: explicit opt-out.
                if (!this.taskParser.isTaskLine(location.line)) {
                    await this.handleTaskDeletion(taskId, metadata.eventId, true);
                    const content = await this.app.vault.read(location.file);
                    const cleaned = content.replace(
                        new RegExp(`\\s*<!-- task-id: ${taskId} -->`, 'g'),
                        ''
                    );
                    if (cleaned !== content) {
                        await this.app.vault.modify(location.file, cleaned);
                    }
                }
                continue;
            }

            // If the old file still exists and the ID is nowhere in the configured
            // scope, a manual Sync Now treats this as an explicit line deletion.
            // If the old file vanished/was renamed, keep metadata for manual orphan
            // review instead of guessing.
            if (metadata.filePath) {
                const originalFile = this.app.vault.getAbstractFileByPath(metadata.filePath);
                if (originalFile instanceof TFile) {
                    await this.handleTaskDeletion(taskId, metadata.eventId, true);
                }
            }
        }
    }

    private async disconnectGoogle() {
        try {
            if (this.authManager?.isAuthenticated()) {
                await this.authManager.revokeAccess();
            }

            // Clear tokens in settings
            if (this.settings.oauth2Tokens) {
                this.settings.oauth2Tokens = undefined;
                await this.saveSettings();
            }

            this.calendarSync = null;
            const { setStatus, setAuthenticated, setSyncEnabled } = useStore.getState();
            setStatus('disconnected');
            setAuthenticated(false);
            setSyncEnabled(false); // Ensure sync is disabled when disconnected
            new Notice('Disconnected from Google Calendar');

            // Show option to reconnect
            const reconnect = window.confirm('Do you want to reconnect to Google Calendar?');
            if (reconnect && this.authManager) {
                this.authManager.authorize();
            }
        } catch (error) {
            useStore.getState().setStatus('error', error instanceof Error ? error : new Error(String(error)));
            new Notice('Failed to disconnect from Google Calendar');
        }
    }

    private isTaskFile(file: TAbstractFile): boolean {
        // First check if it's a markdown file
        if (!(file instanceof TFile) || !file.extension.toLowerCase().endsWith('md')) {
            return false;
        }

        // If no included folders specified, all markdown files are task files
        if (!this.settings.includeFolders || this.settings.includeFolders.length === 0) {
            return true;
        }

        // Get the include settings
        const includeSettings = this.settings.includeFolders;

        // Check for direct file match
        if (includeSettings.some(path => path === file.path)) {
            return true;
        }

        // Check if file is in included folders with strict matching
        if (includeSettings.some(folder => {
            // Skip if this is a direct file reference (likely ends with .md)
            if (!folder.endsWith('/') && folder.includes('.')) {
                return false;
            }
            return file.path.startsWith(folder + '/');
        })) {
            return true;
        }

        // Try more lenient matching (without requiring trailing slash)
        if (includeSettings.some(folder => {
            // Skip if this is a direct file reference
            if (!folder.endsWith('/') && folder.includes('.')) {
                return false;
            }
            const folderNoSlash = folder.endsWith('/') ? folder.slice(0, -1) : folder;
            return file.path.startsWith(folderNoSlash + '/');
        })) {
            return true;
        }

        return false;
    }

    /**
     * Checks if the current token is valid or renews it if needed.
     * @returns true if the token is valid or was successfully renewed
     */
    private async verifyAuthentication(skipPrompt = false): Promise<boolean> {
        // First check the store state - if we were just authenticated via protocol handler
        if (useStore.getState().authenticated) {
            console.log('Already authenticated according to store state');
            return true;
        }

        // If we're already authenticated, return true
        if (this.authManager && this.authManager.isAuthenticated()) {
            try {
                // Perform a token verification test
                await this.authManager.getValidAccessToken();
                return true;
            } catch (error) {
                console.log('Token verification failed:', error);
                // Token might be invalid, proceed to authentication flow
            }
        }

        // If skipPrompt is true, we're coming from the protocol handler or other authenticated source
        if (skipPrompt) {
            return false;
        }

        // Ask user if they want to connect
        const confirmConnection = await this.showConfirmationDialog(
            'Connect to Google Calendar',
            'You need to connect to Google Calendar to sync tasks. Connect now?',
            'Connect',
            'Cancel'
        );

        if (confirmConnection) {
            console.log('🔍 Not authenticated, redirecting to auth flow');
            if (this.authManager) {
                await this.authManager.authorize();
                // Auth flow will handle initializing calendar sync if successful
                return true;
            }
            return false;
        } else {
            console.log('ℹ️ User declined to authenticate');
            return false;
        }
    }

    // Helper method to show a confirmation dialog
    private async showConfirmationDialog(
        title: string,
        message: string,
        confirmText: string,
        cancelText: string
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const confirm = window.confirm(message);
            resolve(confirm);
        });
    }
}    