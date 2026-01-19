/**
 * Structured logging for MCP server tools
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log context with optional metadata
 */
export interface LogContext {
  [key: string]: unknown;
}

/**
 * Logger interface for structured logging
 */
export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
}

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Creates a logger instance with specified minimum log level
 *
 * @param minLevel - Minimum log level to output (default: 'info')
 * @returns Logger instance
 */
export function createLogger(minLevel: LogLevel = 'info'): Logger {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= minPriority;
  }

  function formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level.toUpperCase()}]`;
  }

  function log(
    level: LogLevel,
    consoleFn: (...args: unknown[]) => void,
    message: string,
    context?: LogContext
  ): void {
    if (!shouldLog(level)) {
      return;
    }

    const formattedPrefix = formatMessage(level, message);

    if (context !== undefined) {
      consoleFn(formattedPrefix, message, context);
    } else {
      consoleFn(formattedPrefix, message);
    }
  }

  return {
    debug: (message: string, context?: LogContext) => {
      log('debug', console.debug, message, context);
    },
    info: (message: string, context?: LogContext) => {
      log('info', console.info, message, context);
    },
    warn: (message: string, context?: LogContext) => {
      log('warn', console.warn, message, context);
    },
    error: (message: string, context?: LogContext) => {
      log('error', console.error, message, context);
    },
  };
}

/**
 * Default logger instance with 'info' level
 */
export const logger = createLogger('info');
