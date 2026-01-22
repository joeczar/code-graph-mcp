/**
 * Parse Directory Start tool - initiates async directory parsing
 *
 * Starts a background parse operation for large codebases.
 * Returns immediately with a task ID that can be used to check progress.
 *
 * For small directories (< 1000 files), consider using parse_directory instead.
 * For large directories, this tool provides:
 * - Non-blocking operation (returns immediately)
 * - Progress tracking via parse_directory_status
 * - File-based progress log for `tail -f` monitoring
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fork, type ChildProcess } from 'node:child_process';
import { globby } from 'globby';
import {
  getCheckpointDb,
  createParseTask,
  deleteParseTask,
  getLogPath,
  type ParseWorkerConfig,
} from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse, createErrorResponse } from './types.js';
import { ResourceNotFoundError, ToolExecutionError } from './errors.js';
import { logger } from './logger.js';
import { getCheckpointDbPath } from '../config.js';

/**
 * File extensions supported by the parser
 */
const SUPPORTED_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'rb'];

/**
 * Default file count threshold for confirmation
 */
const DEFAULT_FILE_THRESHOLD = 1000;

/**
 * Get the path to the parse worker module
 * Uses require.resolve to find the core package's package.json, then resolves the worker path
 */
function getWorkerPath(): string {
  const require = createRequire(import.meta.url);
  // Resolve package.json to find the core package's root directory
  const corePackageJson = require.resolve('@code-graph/core/package.json');
  const coreRoot = path.dirname(corePackageJson);
  // Worker is at dist/tasks/parse-worker.js relative to the package root
  return path.join(coreRoot, 'dist', 'tasks', 'parse-worker.js');
}

const parseDirectoryStartInputSchema = z.object({
  path: z.string().describe('Path to directory to parse recursively (absolute or relative to working directory)'),
  pattern: z.string().optional().describe('Optional glob pattern to filter files (e.g., "**/*.ts", "src/**/*.js")'),
  confirm: z.boolean().optional().describe('Set to true to confirm parsing large directories (> 1000 files)'),
  force: z.boolean().optional().describe('Force full reparse even if files have not changed (default: false)'),
});

/**
 * Parse directory start tool definition
 *
 * Starts an async parse operation and returns immediately.
 * Use parse_directory_status to check progress.
 */
export const parseDirectoryStartTool: ToolDefinition<typeof parseDirectoryStartInputSchema> = {
  metadata: {
    name: 'parse_directory_start',
    description: 'Start an async parse operation for a directory. Returns immediately with a task ID. Use parse_directory_status to check progress. For directories with > 1000 files, requires confirm: true.',
    inputSchema: parseDirectoryStartInputSchema,
  },

  handler: async (input) => {
    const { path: inputPath, pattern, confirm, force } = input;

    // Resolve path (handle relative paths)
    const resolvedPath = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(process.cwd(), inputPath);

    // Check directory exists and is a directory
    let stats: fs.Stats;
    try {
      stats = fs.statSync(resolvedPath);
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return createErrorResponse(
            new ResourceNotFoundError(`Directory not found: ${resolvedPath}`, { path: resolvedPath })
          );
        }
        if (code === 'EACCES') {
          return createErrorResponse(
            new ToolExecutionError(`Permission denied: ${resolvedPath}`, {
              path: resolvedPath,
              code,
            })
          );
        }
      }
      return createErrorResponse(
        new ToolExecutionError(`Failed to check directory: ${resolvedPath}`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    if (!stats.isDirectory()) {
      return createErrorResponse(
        new ToolExecutionError(`Path is not a directory: ${resolvedPath}`, { path: resolvedPath })
      );
    }

    // Quick file count using globby
    const extensionPattern = SUPPORTED_EXTENSIONS.map(ext => `**/*.${ext}`);
    let files: string[];
    try {
      files = await globby(pattern ? [pattern] : extensionPattern, {
        cwd: resolvedPath,
        gitignore: true,
        absolute: false,
      });
    } catch (err) {
      return createErrorResponse(
        new ToolExecutionError(`Failed to scan directory: ${resolvedPath}`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    const fileCount = files.length;

    // Check if confirmation is required for large directories
    if (fileCount > DEFAULT_FILE_THRESHOLD && !confirm) {
      return createSuccessResponse(JSON.stringify({
        status: 'confirmation_required',
        fileCount,
        message: `Found ${String(fileCount)} files. This will take a while. Call with confirm: true to proceed.`,
        hint: 'You can monitor progress with: tail -f <progressLogPath>',
      }, null, 2));
    }

    // Check if worker file exists BEFORE creating task (avoids orphaned task records)
    const workerPath = getWorkerPath();
    if (!fs.existsSync(workerPath)) {
      return createErrorResponse(
        new ToolExecutionError(`Worker not found. Run 'pnpm build' first.`, {
          workerPath,
        })
      );
    }

    // Initialize checkpoint database and create task
    const checkpointDbPath = getCheckpointDbPath();
    const checkpointDb = getCheckpointDb(checkpointDbPath);

    // Create task - progress_log_path requires task.id, so we set it after creation
    const task = createParseTask(checkpointDb, {
      directory_path: resolvedPath,
      ...(pattern && { pattern }),
    });

    // Generate and set progress log path (requires task.id which is generated by createParseTask)
    const progressLogPath = getLogPath(task.id);
    checkpointDb.prepare('UPDATE parse_tasks SET progress_log_path = ? WHERE id = ?').run(progressLogPath, task.id);

    // Prepare worker config
    const workerConfig: ParseWorkerConfig = {
      taskId: task.id,
      directoryPath: resolvedPath,
      ...(pattern && { pattern }),
      ...(force && { force }),
      checkpointDbPath,
      progressLogPath,
    };

    let worker: ChildProcess;
    try {
      worker = fork(workerPath, [], {
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        detached: true,
      });

      // Wait for worker to be ready, then send config
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker startup timeout'));
        }, 5000);

        worker.once('message', (msg: unknown) => {
          clearTimeout(timeout);
          if (typeof msg === 'object' && msg !== null && 'type' in msg) {
            const typed = msg as { type: string };
            if (typed.type === 'ready') {
              worker.send({ type: 'start', config: workerConfig });
              resolve();
            } else {
              reject(new Error(`Unexpected worker message: ${typed.type}`));
            }
          }
        });

        worker.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        worker.once('exit', (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error(`Worker exited with code ${String(code)}`));
          }
        });
      });

      // Detach the worker so it continues running after we return
      worker.unref();

      logger.info('Parse worker started', {
        taskId: task.id,
        directory: resolvedPath,
        fileCount,
      });
    } catch (err) {
      // Clean up task on worker startup failure using proper abstraction
      deleteParseTask(checkpointDb, task.id);

      return createErrorResponse(
        new ToolExecutionError(`Failed to start parse worker`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    // Return task info
    const response = {
      status: 'started',
      taskId: task.id,
      directory: resolvedPath,
      fileCount,
      progressLogPath,
      message: `Parse task started. Use parse_directory_status with taskId: "${task.id}" to check progress.`,
      hint: `Monitor progress in real-time with: tail -f ${progressLogPath}`,
    };

    return createSuccessResponse(JSON.stringify(response, null, 2));
  },
};
