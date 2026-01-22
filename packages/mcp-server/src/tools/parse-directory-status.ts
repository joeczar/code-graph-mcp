/**
 * Parse Directory Status tool - checks progress of async parse operations
 *
 * Queries the checkpoint database for task status and returns progress info.
 * Use with task IDs returned from parse_directory_start.
 */

import { z } from 'zod';
import {
  getCheckpointDb,
  getParseTask,
  listParseTasks,
  type ParseTask,
} from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse, createErrorResponse } from './types.js';
import { ResourceNotFoundError } from './errors.js';
import { getCheckpointDbPath } from '../config.js';

const parseDirectoryStatusInputSchema = z.object({
  taskId: z.string().optional().describe('Task ID to check status for. If not provided, lists recent tasks.'),
});

/**
 * Format a task for display
 */
function formatTask(task: ParseTask): Record<string, unknown> {
  const progress = task.total_files > 0
    ? Math.round((task.processed_files / task.total_files) * 100)
    : 0;

  return {
    taskId: task.id,
    status: task.status,
    directory: task.directory_path,
    pattern: task.pattern,
    progress: `${String(task.processed_files)}/${String(task.total_files)} files (${String(progress)}%)`,
    entities: task.entities_count,
    relationships: task.relationships_count,
    currentFile: task.current_file,
    error: task.error,
    progressLogPath: task.progress_log_path,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

/**
 * Parse directory status tool definition
 *
 * Checks the status of an async parse operation.
 */
export const parseDirectoryStatusTool: ToolDefinition<typeof parseDirectoryStatusInputSchema> = {
  metadata: {
    name: 'parse_directory_status',
    description: 'Check the status of an async parse operation started with parse_directory_start. Provide taskId to check a specific task, or omit to list recent tasks.',
    inputSchema: parseDirectoryStatusInputSchema,
  },

  handler: (input) => {
    const { taskId } = input;

    // Initialize checkpoint database
    const checkpointDbPath = getCheckpointDbPath();
    const checkpointDb = getCheckpointDb(checkpointDbPath);

    if (taskId) {
      // Get specific task
      const task = getParseTask(checkpointDb, taskId);

      if (!task) {
        return createErrorResponse(
          new ResourceNotFoundError(`Task not found: ${taskId}`, { taskId })
        );
      }

      const formatted = formatTask(task);

      // Add helpful hints based on status
      if (task.status === 'running') {
        return createSuccessResponse(JSON.stringify({
          ...formatted,
          hint: `Task is running. Monitor progress with: tail -f ${task.progress_log_path ?? ''}`,
        }, null, 2));
      }

      if (task.status === 'completed') {
        return createSuccessResponse(JSON.stringify({
          ...formatted,
          message: 'Parse completed successfully!',
        }, null, 2));
      }

      if (task.status === 'failed') {
        return createSuccessResponse(JSON.stringify({
          ...formatted,
          message: 'Parse failed. Check the error field for details.',
        }, null, 2));
      }

      return createSuccessResponse(JSON.stringify(formatted, null, 2));
    }

    // List recent tasks
    const tasks = listParseTasks(checkpointDb, { limit: 10 });

    if (tasks.length === 0) {
      return createSuccessResponse(JSON.stringify({
        message: 'No parse tasks found. Use parse_directory_start to begin a new parse operation.',
        tasks: [],
      }, null, 2));
    }

    const formattedTasks = tasks.map(formatTask);

    return createSuccessResponse(JSON.stringify({
      message: `Found ${String(tasks.length)} recent parse task(s)`,
      tasks: formattedTasks,
    }, null, 2));
  },
};
