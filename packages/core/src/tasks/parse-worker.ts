#!/usr/bin/env node
/**
 * Parse Worker - Child process for async directory parsing
 *
 * This module is forked as a child process by parse-directory-start.
 * It receives task configuration via IPC, processes the directory,
 * and updates the checkpoint database with progress.
 *
 * Usage: Forked via node:child_process.fork() with task config sent via IPC
 */

import { getCheckpointDb, setParseTaskStatus, updateParseTaskProgress } from '../checkpoint/index.js';
import {
  getDatabase,
  initializeSchema,
  TsMorphFileProcessor,
  FileProcessor,
  DirectoryParser,
  createIncrementalUpdater,
  computeFileHashFromPath,
  createEntityStore,
} from '../index.js';
import { createProgressLogger, type ParsePhase } from './progress-logger.js';
import type { ProgressCallback } from '../parser/index.js';
import * as path from 'node:path';

/**
 * Configuration passed to the worker via IPC
 */
export interface ParseWorkerConfig {
  taskId: string;
  directoryPath: string;
  pattern?: string;
  force?: boolean;
  checkpointDbPath: string;
  progressLogPath: string;
}

/**
 * TypeScript/JavaScript file extensions that should be processed with ts-morph
 */
const TS_JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Ruby file extensions that should be processed with tree-sitter
 */
const RUBY_EXTENSIONS = ['.rb'];

/**
 * Check if a file should be processed with ts-morph (TypeScript/JavaScript)
 */
function isTsJsFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TS_JS_EXTENSIONS.includes(ext);
}

/**
 * Check if a file should be processed with Ruby parser
 */
function isRubyFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return RUBY_EXTENSIONS.includes(ext);
}

/**
 * Human-readable labels for ts-morph parsing phases
 */
const PHASE_LABELS: Record<string, string> = {
  scan: 'Scanning',
  load: 'Loading',
  entities: 'Extracting entities',
  relationships: 'Extracting relationships',
};

/**
 * Progress update throttle interval in milliseconds
 * Used to prevent flooding clients with too many updates
 */
const PROGRESS_THROTTLE_MS = 500;

/**
 * Run the parse worker with the given configuration
 */
async function runWorker(config: ParseWorkerConfig): Promise<void> {
  const { taskId, directoryPath, pattern, force = false, checkpointDbPath, progressLogPath } = config;

  // Initialize progress logger
  const logDir = path.dirname(progressLogPath);
  const logger = createProgressLogger(taskId, logDir);

  // Open checkpoint database connection
  const checkpointDb = getCheckpointDb(checkpointDbPath);

  // Track start time for duration
  const startTime = Date.now();

  try {
    // Update status to running
    setParseTaskStatus(checkpointDb, taskId, 'running');

    // Initialize code graph database
    const db = getDatabase();
    initializeSchema(db);

    // Use DirectoryParser to find files
    const directoryParser = new DirectoryParser();

    logger.logStart(directoryPath, 0); // Will update with actual count

    // Parse directory to get file list
    const parseResult = await directoryParser.parseDirectory({
      directory: directoryPath,
    });

    // Filter by pattern if provided
    let files = parseResult.files;
    if (pattern) {
      const patternRegex = new RegExp(
        pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
      );
      files = files.filter(f => patternRegex.test(f.filePath));
    }

    // Separate files by type
    const tsJsFiles = files.filter(f => isTsJsFile(f.filePath));
    const rubyFiles = files.filter(f => isRubyFile(f.filePath));
    const totalFiles = tsJsFiles.length + rubyFiles.length;

    // Update task with total file count
    updateParseTaskProgress(checkpointDb, taskId, { total_files: totalFiles });
    logger.logProgress(0, totalFiles, 'scan', `Found ${String(totalFiles)} files (${String(tsJsFiles.length)} TS/JS, ${String(rubyFiles.length)} Ruby)`);

    // Create incremental updater for change detection
    const incrementalUpdater = createIncrementalUpdater(db);
    const entityStore = createEntityStore(db);

    // Compute file hashes and determine which files need reparsing
    logger.logProgress(0, totalFiles, 'scan', 'Computing file hashes for incremental update...');

    const allFilePaths = [...tsJsFiles, ...rubyFiles].map(f => f.filePath);
    const fileHashes = new Map<string, string>();
    const filesToReparse: string[] = [];

    for (const filePath of allFilePaths) {
      const hash = await computeFileHashFromPath(filePath);
      if (hash) {
        fileHashes.set(filePath, hash);
        if (force || incrementalUpdater.shouldReparse(filePath, hash)) {
          filesToReparse.push(filePath);
        }
      }
    }

    // Remove stale files (files in DB that no longer exist in the directory)
    const staleResults = incrementalUpdater.removeStaleFiles(allFilePaths);
    const staleFilesRemoved = staleResults.filter(r => r.action === 'deleted').length;
    if (staleFilesRemoved > 0) {
      logger.logProgress(0, totalFiles, 'scan', `Removed ${String(staleFilesRemoved)} stale files from database`);
    }

    // Check if any files need reparsing
    const unchangedCount = allFilePaths.length - filesToReparse.length;
    if (!force && filesToReparse.length === 0 && allFilePaths.length > 0) {
      // No files changed - complete early with cached results
      const cachedEntities = entityStore.getAll();
      const duration = Date.now() - startTime;

      logger.logProgress(totalFiles, totalFiles, 'scan', `No files changed. ${String(unchangedCount)} files unchanged.`);
      logger.logComplete(duration, cachedEntities.length, 0);

      updateParseTaskProgress(checkpointDb, taskId, {
        processed_files: totalFiles,
        entities_count: cachedEntities.length,
        relationships_count: 0,
        current_file: null,
      });
      setParseTaskStatus(checkpointDb, taskId, 'completed');

      if (process.send) {
        process.send({ type: 'complete', taskId, success: true });
      }
      return;
    }

    // Log incremental update info
    logger.logProgress(0, totalFiles, 'scan', `Incremental update: ${String(filesToReparse.length)}/${String(allFilePaths.length)} files to reparse`);

    // Delete entities from files that will be reparsed (for clean reparse)
    for (const filePath of filesToReparse) {
      entityStore.deleteByFile(filePath);
    }

    let processedFiles = 0;
    let totalEntities = 0;
    let totalRelationships = 0;

    // Phase 1: Process TypeScript/JavaScript files with ts-morph
    if (tsJsFiles.length > 0) {
      logger.logProgress(0, totalFiles, 'load', `Processing ${String(tsJsFiles.length)} TypeScript/JavaScript files...`);

      const tsMorphProcessor = new TsMorphFileProcessor();

      // Throttle progress updates
      let lastProgressUpdate = Date.now();

      const onProgress: ProgressCallback = (phase, current, total, message) => {
        const now = Date.now();
        if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS && current < total) {
          return;
        }
        lastProgressUpdate = now;

        const phaseLabel = PHASE_LABELS[phase] ?? phase;
        logger.logProgress(current, total, phase as ParsePhase, `[ts-morph] ${phaseLabel}: ${message}`);

        // Update database with current file
        updateParseTaskProgress(checkpointDb, taskId, {
          current_file: message,
        });
      };

      const tsResult = tsMorphProcessor.processProject({
        projectPath: directoryPath,
        db,
        onProgress,
      });

      if (tsResult.success) {
        const filesLoaded = tsResult.stats?.filesLoaded ?? tsJsFiles.length;
        processedFiles += filesLoaded;
        totalEntities += tsResult.entities.length;
        totalRelationships += tsResult.relationships.length;

        updateParseTaskProgress(checkpointDb, taskId, {
          processed_files: processedFiles,
          entities_count: totalEntities,
          relationships_count: totalRelationships,
        });
      } else {
        throw new Error(tsResult.error ?? 'TypeScript/JavaScript processing failed');
      }
    }

    // Phase 2: Process Ruby files with tree-sitter
    if (rubyFiles.length > 0) {
      const processor = new FileProcessor();

      // Time-based throttling (consistent with TypeScript processing)
      let lastRubyProgressUpdate = Date.now();

      for (let i = 0; i < rubyFiles.length; i++) {
        const fileResult = rubyFiles[i];
        if (!fileResult) continue;

        const relativePath = path.relative(directoryPath, fileResult.filePath);

        // Throttle progress updates to avoid flooding
        const now = Date.now();
        if (now - lastRubyProgressUpdate >= PROGRESS_THROTTLE_MS || i === rubyFiles.length - 1) {
          lastRubyProgressUpdate = now;
          logger.logProgress(
            tsJsFiles.length + i + 1,
            totalFiles,
            'ruby',
            `Processing: ${relativePath}`
          );
          updateParseTaskProgress(checkpointDb, taskId, {
            current_file: relativePath,
            processed_files: processedFiles,
            entities_count: totalEntities,
            relationships_count: totalRelationships,
          });
        }

        if (!fileResult.success || !fileResult.result) {
          continue; // Skip failed files
        }

        try {
          const storeResult = await processor.processFile({
            filePath: fileResult.filePath,
            db,
          });

          if (storeResult.success) {
            processedFiles++;
            totalEntities += storeResult.entities.length;
            totalRelationships += storeResult.relationships.length;
          }
        } catch (err) {
          // Log error for debugging (consistent with sync parse-directory.ts)
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.logProgress(
            tsJsFiles.length + i + 1,
            totalFiles,
            'ruby',
            `Error processing ${relativePath}: ${errorMsg}`
          );
        }
      }
    }

    // Final update
    const duration = Date.now() - startTime;
    updateParseTaskProgress(checkpointDb, taskId, {
      processed_files: processedFiles,
      entities_count: totalEntities,
      relationships_count: totalRelationships,
      current_file: null,
    });

    setParseTaskStatus(checkpointDb, taskId, 'completed');
    logger.logComplete(duration, totalEntities, totalRelationships);

    // Send completion message to parent
    if (process.send) {
      process.send({ type: 'complete', taskId, success: true });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setParseTaskStatus(checkpointDb, taskId, 'failed', errorMessage);
    logger.logError(errorMessage);

    // Send error message to parent
    if (process.send) {
      process.send({ type: 'complete', taskId, success: false, error: errorMessage });
    }
  }
}

// Handle IPC messages when running as child process
if (process.send) {
  process.on('message', (message: unknown) => {
    if (typeof message === 'object' && message !== null && 'type' in message) {
      const msg = message as { type: string; config?: ParseWorkerConfig };
      if (msg.type === 'start' && msg.config) {
        runWorker(msg.config)
          .catch((err: unknown) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('[parse-worker] Fatal error:', errorMessage);
            process.exit(1);
          });
      }
    }
  });

  // Signal ready to receive config
  process.send({ type: 'ready' });
}

export { runWorker };
