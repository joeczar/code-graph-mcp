/**
 * Tests for parse-directory-status tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  resetDatabase,
  closeCheckpointDb,
  getCheckpointDb,
  createParseTask,
  setParseTaskStatus,
  updateParseTaskProgress,
} from '@code-graph/core';
import { parseDirectoryStatusTool } from '../parse-directory-status.js';

/**
 * Expected shape of task status response
 */
interface TaskStatusResponse {
  taskId?: string;
  status?: string;
  directory?: string;
  pattern?: string | null;
  progress?: string;
  entities?: number;
  relationships?: number;
  currentFile?: string | null;
  error?: string | null;
  progressLogPath?: string | null;
  hint?: string;
  message?: string;
  tasks?: TaskStatusResponse[];
}

describe('parseDirectoryStatusTool', () => {
  let tempDir: string;
  let checkpointDbPath: string;

  beforeEach(() => {
    // Reset database before each test
    resetDatabase();

    // Create temp directory for checkpoint db
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-status-test-'));
    checkpointDbPath = path.join(tempDir, 'checkpoint.db');

    // Set environment variable for checkpoint db path
    process.env['CHECKPOINT_DB_PATH'] = checkpointDbPath;
  });

  afterEach(() => {
    resetDatabase();
    closeCheckpointDb();

    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Clear environment variable
    delete process.env['CHECKPOINT_DB_PATH'];
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parseDirectoryStatusTool.metadata.name).toBe('parse_directory_status');
    });

    it('should have description mentioning status', () => {
      expect(parseDirectoryStatusTool.metadata.description.toLowerCase()).toContain('status');
    });

    it('should accept optional taskId parameter', () => {
      const withTaskId = parseDirectoryStatusTool.metadata.inputSchema.safeParse({
        taskId: 'abc-123',
      });
      expect(withTaskId.success).toBe(true);

      const withoutTaskId = parseDirectoryStatusTool.metadata.inputSchema.safeParse({});
      expect(withoutTaskId.success).toBe(true);
    });
  });

  describe('handler', () => {
    describe('task not found', () => {
      it('should return error for non-existent task', async () => {
        const response = await parseDirectoryStatusTool.handler({
          taskId: 'non-existent-task-id',
        });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Task not found');
      });
    });

    describe('list tasks', () => {
      it('should return empty list when no tasks exist', async () => {
        const response = await parseDirectoryStatusTool.handler({});

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.message).toContain('No parse tasks found');
        expect(result.tasks).toEqual([]);
      });

      it('should list recent tasks when they exist', async () => {
        // Create some tasks
        const db = getCheckpointDb(checkpointDbPath);
        createParseTask(db, { directory_path: '/project1' });
        createParseTask(db, { directory_path: '/project2' });

        const response = await parseDirectoryStatusTool.handler({});

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.message).toContain('2 recent parse task');
        expect(result.tasks).toHaveLength(2);
      });
    });

    describe('task status', () => {
      it('should return pending task status', async () => {
        const db = getCheckpointDb(checkpointDbPath);
        const task = createParseTask(db, { directory_path: '/project' });

        const response = await parseDirectoryStatusTool.handler({ taskId: task.id });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.taskId).toBe(task.id);
        expect(result.status).toBe('pending');
        expect(result.directory).toBe('/project');
      });

      it('should return running task status with hint', async () => {
        const db = getCheckpointDb(checkpointDbPath);
        const task = createParseTask(db, {
          directory_path: '/project',
          progress_log_path: '/path/to/log.txt',
        });
        setParseTaskStatus(db, task.id, 'running');

        const response = await parseDirectoryStatusTool.handler({ taskId: task.id });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.status).toBe('running');
        expect(result.hint).toContain('tail -f');
      });

      it('should return completed task status with message', async () => {
        const db = getCheckpointDb(checkpointDbPath);
        const task = createParseTask(db, { directory_path: '/project' });
        setParseTaskStatus(db, task.id, 'completed');
        updateParseTaskProgress(db, task.id, {
          total_files: 100,
          processed_files: 100,
          entities_count: 500,
          relationships_count: 200,
        });

        const response = await parseDirectoryStatusTool.handler({ taskId: task.id });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.status).toBe('completed');
        expect(result.message).toContain('completed successfully');
        expect(result.entities).toBe(500);
        expect(result.relationships).toBe(200);
      });

      it('should return failed task status with error', async () => {
        const db = getCheckpointDb(checkpointDbPath);
        const task = createParseTask(db, { directory_path: '/project' });
        setParseTaskStatus(db, task.id, 'failed', 'Something went wrong');

        const response = await parseDirectoryStatusTool.handler({ taskId: task.id });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Something went wrong');
        expect(result.message).toContain('failed');
      });

      it('should format progress correctly', async () => {
        const db = getCheckpointDb(checkpointDbPath);
        const task = createParseTask(db, { directory_path: '/project' });
        setParseTaskStatus(db, task.id, 'running');
        updateParseTaskProgress(db, task.id, {
          total_files: 100,
          processed_files: 50,
        });

        const response = await parseDirectoryStatusTool.handler({ taskId: task.id });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        const result = JSON.parse(text) as TaskStatusResponse;

        expect(result.progress).toBe('50/100 files (50%)');
      });
    });
  });
});
