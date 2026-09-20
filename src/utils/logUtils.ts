import { LOG_LEVELS } from '../config/constants';
import { Notice } from 'obsidian';
import type GoogleCalendarSync from '../core/main';

export class LogUtils {
    private static plugin: GoogleCalendarSync;

    static initialize(plugin: GoogleCalendarSync) {
        this.plugin = plugin;
    }

    /**
     * Debug level logging - only shown if verboseLogging is enabled
     */
    static debug(message: string, ...args: unknown[]) {
        if (this.plugin?.settings.verboseLogging) {
            console.log(`${LOG_LEVELS.DEBUG} ${message}`, ...args);
        }
    }

    /**
     * Info level logging
     */
    static info(message: string, ...args: unknown[]) {
        console.log(`${LOG_LEVELS.INFO} ${message}`, ...args);
    }

    /**
     * Warning level logging
     */
    static warn(message: string, ...args: unknown[]) {
        console.log(`${LOG_LEVELS.WARN} ${message}`, ...args);
    }

    /**
     * Error level logging (console only - use notify() for user-visible errors)
     */
    static error(message: string, error?: unknown) {
        console.error(`${LOG_LEVELS.ERROR} ${message}`, error);
    }

    /**
     * Success level logging
     */
    static success(message: string, ...args: unknown[]) {
        console.log(`${LOG_LEVELS.SUCCESS} ${message}`, ...args);
    }

    /**
     * Log with notice (user visible)
     */
    static notify(message: string, isError = false) {
        const icon = isError ? LOG_LEVELS.ERROR : LOG_LEVELS.SUCCESS;
        new Notice(`${icon} ${message}`);
    }



} 