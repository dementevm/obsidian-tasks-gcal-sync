import type GoogleCalendarSync from '../core/main';
import { LOG_LEVELS } from '../config/constants';

export class LogUtils {
    private static plugin?: GoogleCalendarSync;

    static initialize(plugin: GoogleCalendarSync): void {
        this.plugin = plugin;
    }

    static debug(message: string, ...args: unknown[]): void {
        if (this.plugin?.settings.verboseLogging) {
            console.debug(`${LOG_LEVELS.DEBUG} ${message}`, ...args);
        }
    }

    static info(message: string, ...args: unknown[]): void {
        console.info(`${LOG_LEVELS.INFO} ${message}`, ...args);
    }

    static warn(message: string, ...args: unknown[]): void {
        console.warn(`${LOG_LEVELS.WARN} ${message}`, ...args);
    }

    static error(message: string, error?: unknown): void {
        if (error === undefined) {
            console.error(`${LOG_LEVELS.ERROR} ${message}`);
            return;
        }

        console.error(`${LOG_LEVELS.ERROR} ${message}`, error);
    }
}
