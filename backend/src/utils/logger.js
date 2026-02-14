/**
 * Structured Logger Utility
 * Uses Node.js built-in features only (no external dependencies).
 *
 * Levels: debug, info, warn, error
 * Format: [TIMESTAMP] [LEVEL] [MODULE] message { data }
 *
 * Production:  JSON to stdout (for Docker logs / log aggregators)
 * Development: Colorful, human-readable console output
 *
 * Usage:
 *   import { createLogger } from '../utils/logger.js';
 *   const log = createLogger('WebSocket');
 *   log.info('Client connected', { clientId: 'abc123' });
 */

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

// Minimum log level from environment (default: debug in dev, info in production)
const isProduction = process.env.NODE_ENV === 'production';
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? (isProduction ? LOG_LEVELS.info : LOG_LEVELS.debug);

// ANSI color codes for development output
const COLORS = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    // Level colors
    debug: '\x1b[36m',   // cyan
    info: '\x1b[32m',    // green
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    // Module color
    module: '\x1b[35m',  // magenta
};

/**
 * Formats a timestamp in ISO-like format without milliseconds.
 * @returns {string}
 */
function timestamp() {
    return new Date().toISOString();
}

/**
 * Production formatter - outputs single-line JSON to stdout.
 */
function formatProduction(level, moduleName, message, data) {
    const entry = {
        timestamp: timestamp(),
        level,
        module: moduleName,
        message,
    };

    if (data !== undefined && data !== null) {
        // If data is an Error, serialise it properly
        if (data instanceof Error) {
            entry.error = {
                name: data.name,
                message: data.message,
                stack: data.stack,
            };
        } else {
            entry.data = data;
        }
    }

    return JSON.stringify(entry);
}

/**
 * Development formatter - colorful, human-readable output.
 */
function formatDevelopment(level, moduleName, message, data) {
    const ts = timestamp();
    const c = COLORS;
    const levelColor = c[level] || c.reset;
    const levelTag = level.toUpperCase().padEnd(5);

    let line = `${c.dim}${ts}${c.reset} ${levelColor}${c.bold}[${levelTag}]${c.reset} ${c.module}[${moduleName}]${c.reset} ${message}`;

    if (data !== undefined && data !== null) {
        if (data instanceof Error) {
            line += ` ${c.error}${data.message}${c.reset}`;
            if (data.stack) {
                line += `\n${c.dim}${data.stack}${c.reset}`;
            }
        } else if (typeof data === 'object') {
            try {
                const jsonStr = JSON.stringify(data, null, 0);
                // Keep inline if reasonably short
                if (jsonStr.length <= 200) {
                    line += ` ${c.dim}${jsonStr}${c.reset}`;
                } else {
                    line += `\n${c.dim}${JSON.stringify(data, null, 2)}${c.reset}`;
                }
            } catch {
                line += ` ${c.dim}[unserializable data]${c.reset}`;
            }
        } else {
            line += ` ${c.dim}${String(data)}${c.reset}`;
        }
    }

    return line;
}

/**
 * Writes a log entry to the appropriate stream.
 */
function write(level, moduleName, message, data) {
    if (LOG_LEVELS[level] < MIN_LEVEL) return;

    const formatted = isProduction
        ? formatProduction(level, moduleName, message, data)
        : formatDevelopment(level, moduleName, message, data);

    if (level === 'error') {
        process.stderr.write(formatted + '\n');
    } else {
        process.stdout.write(formatted + '\n');
    }
}

/**
 * Creates a scoped logger for a specific module / component.
 *
 * @param {string} moduleName - Name shown in log output (e.g. 'WebSocket', 'Database')
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 *
 * @example
 *   const log = createLogger('WebSocket');
 *   log.info('Client connected', { clientId });
 *   log.error('Connection failed', error);
 */
export function createLogger(moduleName) {
    return {
        debug: (message, data) => write('debug', moduleName, message, data),
        info: (message, data) => write('info', moduleName, message, data),
        warn: (message, data) => write('warn', moduleName, message, data),
        error: (message, data) => write('error', moduleName, message, data),
    };
}

export default createLogger;
