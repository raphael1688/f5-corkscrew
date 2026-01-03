/* eslint-disable @typescript-eslint/no-explicit-any */
import { inspect } from "util";

/**
 * Simple logger class for corkscrew
 *
 * Supports debug, info, error levels with journal buffering.
 * Console output can be toggled via the `console` property.
 */
class Log {
    /** Journal of log messages */
    journal: string[] = [];

    /** Whether to output logs to console (default: false for library use) */
    console = false;

    /**
     * Log debug message
     */
    debug(...msg: [unknown, ...unknown[]]): void {
        this.write('DEBUG', ...msg);
    }

    /**
     * Log info message
     */
    info(...msg: [unknown, ...unknown[]]): void {
        this.write('INFO', ...msg);
    }

    /**
     * Log error message
     */
    error(...msg: [unknown, ...unknown[]]): void {
        this.write('ERROR', ...msg);
    }

    /**
     * Core log writer - formats and stores log entry
     */
    private write(label: string, ...messageParts: unknown[]): void {
        const message = messageParts.map(this.stringify).join(' ');
        const dateTime = new Date().toISOString();
        const log = `[${dateTime}] [${label}]: ${message}`;

        this.journal.push(log);

        if (this.console) {
            console.log(log);
        }
    }

    /**
     * Returns logs as string array
     */
    getLogs(): string[] {
        return this.journal;
    }

    /**
     * Clear the log journal
     */
    clearLogs(): void {
        this.journal = [];
    }

    private stringify(val: unknown): string {
        if (typeof val === 'string') { return val; }
        return inspect(val, {
            colors: false,
            depth: 6,
        });
    }
}

const logger = new Log();
export default logger;