/**
 * Tasks module - Async task management for long-running operations
 *
 * Provides infrastructure for background parsing tasks with progress tracking.
 */

// Progress logging
export {
  createProgressLogger,
  getDefaultLogDir,
  getLogPath,
  type ProgressLogger,
  type ParsePhase,
} from './progress-logger.js';

// Worker configuration type (for spawning workers)
export type { ParseWorkerConfig } from './parse-worker.js';
