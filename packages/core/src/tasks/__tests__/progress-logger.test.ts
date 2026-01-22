/**
 * Tests for progress logger functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProgressLogger, getLogPath, getDefaultLogDir } from '../progress-logger.js';

describe('Progress Logger', () => {
  let testDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `progress-logger-test-${String(Date.now())}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createProgressLogger', () => {
    it('should create a log file when logging', () => {
      const taskId = 'test-task-123';
      const logger = createProgressLogger(taskId, testDir);

      logger.logStart('/path/to/project', 100);

      const logPath = logger.getLogPath();
      expect(existsSync(logPath)).toBe(true);
    });

    it('should log start entries with timestamp', () => {
      const taskId = 'test-task-456';
      const logger = createProgressLogger(taskId, testDir);

      logger.logStart('/path/to/project', 250);

      const content = readFileSync(logger.getLogPath(), 'utf-8');
      expect(content).toContain(`Task ${taskId} started`);
      expect(content).toContain('Directory: /path/to/project');
      expect(content).toContain('Total files: 250');
      // Check timestamp format
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should log progress with phase and percentage', () => {
      const taskId = 'test-task-789';
      const logger = createProgressLogger(taskId, testDir);

      logger.logProgress(50, 100, 'load', 'Processing file.ts');

      const content = readFileSync(logger.getLogPath(), 'utf-8');
      expect(content).toContain('[load] 50/100 (50%) - Processing file.ts');
    });

    it('should log completion with duration and counts', () => {
      const taskId = 'test-task-complete';
      const logger = createProgressLogger(taskId, testDir);

      logger.logComplete(300000, 1234, 567); // 5 minutes

      const content = readFileSync(logger.getLogPath(), 'utf-8');
      expect(content).toContain('=== COMPLETED ===');
      expect(content).toContain('Duration: 5m 0s');
      expect(content).toContain('Entities: 1,234 | Relationships: 567');
    });

    it('should log errors with message', () => {
      const taskId = 'test-task-error';
      const logger = createProgressLogger(taskId, testDir);

      logger.logError('Something went wrong');

      const content = readFileSync(logger.getLogPath(), 'utf-8');
      expect(content).toContain('=== FAILED ===');
      expect(content).toContain('Error: Something went wrong');
    });

    it('should handle zero total files gracefully', () => {
      const taskId = 'test-task-zero';
      const logger = createProgressLogger(taskId, testDir);

      logger.logProgress(0, 0, 'scan', 'No files found');

      const content = readFileSync(logger.getLogPath(), 'utf-8');
      expect(content).toContain('[scan] 0/0 (0%) - No files found');
    });
  });

  describe('getLogPath', () => {
    it('should return path with task ID', () => {
      const taskId = 'my-task-id';
      const logPath = getLogPath(taskId, testDir);

      expect(logPath).toBe(join(testDir, `${taskId}.log`));
    });

    it('should use default directory when not specified', () => {
      const taskId = 'default-dir-task';
      const logPath = getLogPath(taskId);

      expect(logPath).toContain(taskId);
      expect(logPath).toBe(join(getDefaultLogDir(), `${taskId}.log`));
    });
  });

  describe('getDefaultLogDir', () => {
    it('should return a path in the home directory cache', () => {
      const defaultDir = getDefaultLogDir();

      expect(defaultDir).toContain('.cache');
      expect(defaultDir).toContain('code-graph');
      expect(defaultDir).toContain('progress');
    });
  });
});
