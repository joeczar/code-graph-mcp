/**
 * Progress Logger - File-based progress tracking for async parse tasks
 *
 * Writes timestamped progress entries to a log file that users can
 * monitor with `tail -f` for real-time progress updates.
 */

import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Default directory for progress log files
 */
const DEFAULT_LOG_DIR = join(homedir(), '.cache', 'code-graph', 'progress');

/**
 * Supported parsing phases
 */
export type ParsePhase = 'scan' | 'load' | 'entities' | 'relationships' | 'ruby';

/**
 * Progress logger for tracking async parse task progress
 */
export interface ProgressLogger {
  /** Log a progress entry */
  logProgress(current: number, total: number, phase: ParsePhase, message: string): void;
  /** Log task start */
  logStart(directoryPath: string, totalFiles: number): void;
  /** Log task completion */
  logComplete(duration: number, entitiesCount: number, relationshipsCount: number): void;
  /** Log task failure */
  logError(error: string): void;
  /** Get the log file path */
  getLogPath(): string;
}

/**
 * Format duration in human-readable format (Xm Ys)
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${String(minutes)}m ${String(remainingSeconds)}s`;
  }
  return `${String(remainingSeconds)}s`;
}

/**
 * Format number with thousands separators
 */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Create a progress logger for a task
 *
 * @param taskId - Unique task identifier
 * @param logDir - Optional custom log directory (defaults to ~/.cache/code-graph/progress)
 */
export function createProgressLogger(taskId: string, logDir?: string): ProgressLogger {
  const dir = logDir ?? DEFAULT_LOG_DIR;
  const logPath = join(dir, `${taskId}.log`);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const writeEntry = (message: string): void => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}\n`;
    appendFileSync(logPath, entry);
  };

  return {
    logProgress(current: number, total: number, phase: ParsePhase, message: string): void {
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      writeEntry(`[${phase}] ${String(current)}/${String(total)} (${String(percent)}%) - ${message}`);
    },

    logStart(directoryPath: string, totalFiles: number): void {
      writeEntry(`Task ${taskId} started`);
      writeEntry(`Directory: ${directoryPath}`);
      writeEntry(`Total files: ${String(totalFiles)}`);
    },

    logComplete(duration: number, entitiesCount: number, relationshipsCount: number): void {
      writeEntry('=== COMPLETED ===');
      writeEntry(`Duration: ${formatDuration(duration)}`);
      writeEntry(`Entities: ${formatNumber(entitiesCount)} | Relationships: ${formatNumber(relationshipsCount)}`);
    },

    logError(error: string): void {
      writeEntry('=== FAILED ===');
      writeEntry(`Error: ${error}`);
    },

    getLogPath(): string {
      return logPath;
    },
  };
}

/**
 * Get the default log directory path
 */
export function getDefaultLogDir(): string {
  return DEFAULT_LOG_DIR;
}

/**
 * Generate a log file path for a task ID
 */
export function getLogPath(taskId: string, logDir?: string): string {
  const dir = logDir ?? DEFAULT_LOG_DIR;
  return join(dir, `${taskId}.log`);
}
