/**
 * Tests for parse task database operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getCheckpointDb,
  closeCheckpointDb,
  createParseTask,
  getParseTask,
  listParseTasks,
  setParseTaskStatus,
  updateParseTaskProgress,
  deleteParseTask,
} from '../db.js';

describe('Parse Task Operations', () => {
  let testDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `parse-tasks-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
    dbPath = join(testDir, 'test-checkpoint.db');
  });

  afterEach(() => {
    // Close database and clean up
    closeCheckpointDb();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createParseTask', () => {
    it('should create a task with default values', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, {
        directory_path: '/path/to/project',
      });

      expect(task.id).toBeDefined();
      expect(task.directory_path).toBe('/path/to/project');
      expect(task.pattern).toBeNull();
      expect(task.status).toBe('pending');
      expect(task.total_files).toBe(0);
      expect(task.processed_files).toBe(0);
      expect(task.entities_count).toBe(0);
      expect(task.relationships_count).toBe(0);
      expect(task.current_file).toBeNull();
      expect(task.error).toBeNull();
    });

    it('should create a task with pattern', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, {
        directory_path: '/path/to/project',
        pattern: '**/*.ts',
      });

      expect(task.pattern).toBe('**/*.ts');
    });

    it('should create a task with progress log path', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, {
        directory_path: '/path/to/project',
        progress_log_path: '/path/to/log.txt',
      });

      expect(task.progress_log_path).toBe('/path/to/log.txt');
    });
  });

  describe('getParseTask', () => {
    it('should retrieve an existing task', () => {
      const db = getCheckpointDb(dbPath);
      const created = createParseTask(db, {
        directory_path: '/path/to/project',
      });

      const retrieved = getParseTask(db, created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.directory_path).toBe('/path/to/project');
    });

    it('should return null for non-existent task', () => {
      const db = getCheckpointDb(dbPath);

      const retrieved = getParseTask(db, 'non-existent-id');

      expect(retrieved).toBeNull();
    });
  });

  describe('listParseTasks', () => {
    it('should list all tasks', () => {
      const db = getCheckpointDb(dbPath);
      createParseTask(db, { directory_path: '/project1' });
      createParseTask(db, { directory_path: '/project2' });
      createParseTask(db, { directory_path: '/project3' });

      const tasks = listParseTasks(db);

      expect(tasks).toHaveLength(3);
    });

    it('should filter by status', () => {
      const db = getCheckpointDb(dbPath);
      const task1 = createParseTask(db, { directory_path: '/project1' });
      createParseTask(db, { directory_path: '/project2' });
      setParseTaskStatus(db, task1.id, 'running');

      const runningTasks = listParseTasks(db, { status: 'running' });

      expect(runningTasks).toHaveLength(1);
      expect(runningTasks[0]?.directory_path).toBe('/project1');
    });

    it('should limit results', () => {
      const db = getCheckpointDb(dbPath);
      for (let i = 0; i < 10; i++) {
        createParseTask(db, { directory_path: `/project${String(i)}` });
      }

      const tasks = listParseTasks(db, { limit: 5 });

      expect(tasks).toHaveLength(5);
    });

    it('should order by updated_at descending', () => {
      const db = getCheckpointDb(dbPath);
      const task1 = createParseTask(db, { directory_path: '/project1' });
      const task2 = createParseTask(db, { directory_path: '/project2' });

      // Update task1 to make it more recent
      setParseTaskStatus(db, task1.id, 'running');

      const tasks = listParseTasks(db);

      expect(tasks[0]?.id).toBe(task1.id);
      expect(tasks[1]?.id).toBe(task2.id);
    });
  });

  describe('setParseTaskStatus', () => {
    it('should update status', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      setParseTaskStatus(db, task.id, 'running');

      const updated = getParseTask(db, task.id);
      expect(updated?.status).toBe('running');
    });

    it('should set error message when failed', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      setParseTaskStatus(db, task.id, 'failed', 'Something went wrong');

      const updated = getParseTask(db, task.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toBe('Something went wrong');
    });

    it('should return false for non-existent task', () => {
      const db = getCheckpointDb(dbPath);

      const result = setParseTaskStatus(db, 'non-existent', 'running');

      expect(result).toBe(false);
    });
  });

  describe('updateParseTaskProgress', () => {
    it('should update total_files', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      updateParseTaskProgress(db, task.id, { total_files: 100 });

      const updated = getParseTask(db, task.id);
      expect(updated?.total_files).toBe(100);
    });

    it('should update processed_files', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      updateParseTaskProgress(db, task.id, { processed_files: 50 });

      const updated = getParseTask(db, task.id);
      expect(updated?.processed_files).toBe(50);
    });

    it('should update multiple fields at once', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      updateParseTaskProgress(db, task.id, {
        total_files: 100,
        processed_files: 50,
        entities_count: 200,
        relationships_count: 100,
        current_file: 'src/index.ts',
      });

      const updated = getParseTask(db, task.id);
      expect(updated?.total_files).toBe(100);
      expect(updated?.processed_files).toBe(50);
      expect(updated?.entities_count).toBe(200);
      expect(updated?.relationships_count).toBe(100);
      expect(updated?.current_file).toBe('src/index.ts');
    });

    it('should clear current_file when set to null', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      updateParseTaskProgress(db, task.id, { current_file: 'src/index.ts' });
      updateParseTaskProgress(db, task.id, { current_file: null });

      const updated = getParseTask(db, task.id);
      expect(updated?.current_file).toBeNull();
    });
  });

  describe('deleteParseTask', () => {
    it('should delete a task', () => {
      const db = getCheckpointDb(dbPath);
      const task = createParseTask(db, { directory_path: '/project' });

      const result = deleteParseTask(db, task.id);

      expect(result).toBe(true);
      expect(getParseTask(db, task.id)).toBeNull();
    });

    it('should return false for non-existent task', () => {
      const db = getCheckpointDb(dbPath);

      const result = deleteParseTask(db, 'non-existent');

      expect(result).toBe(false);
    });
  });
});
