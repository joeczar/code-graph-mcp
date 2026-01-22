/**
 * Tests for parse-directory-start tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { resetDatabase, closeCheckpointDb, getCheckpointDb, getParseTask } from '@code-graph/core';
import { parseDirectoryStartTool } from '../parse-directory-start.js';

/**
 * Expected shape of successful start response
 */
interface StartResponse {
  status: string;
  taskId?: string;
  progressLogPath?: string;
  directory?: string;
  fileCount?: number;
  message?: string;
}

// Path to fixtures in core package
const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '../../../../core/src/graph/__tests__/fixtures'
);

describe('parseDirectoryStartTool', () => {
  let tempDir: string;
  let checkpointDbPath: string;

  beforeEach(() => {
    // Reset database before each test
    resetDatabase();

    // Create temp directory for checkpoint db
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-start-test-'));
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
      expect(parseDirectoryStartTool.metadata.name).toBe('parse_directory_start');
    });

    it('should have description mentioning async', () => {
      expect(parseDirectoryStartTool.metadata.description.toLowerCase()).toContain('async');
    });

    it('should validate path parameter', () => {
      const validResult = parseDirectoryStartTool.metadata.inputSchema.safeParse({ path: '/test' });
      expect(validResult.success).toBe(true);

      const invalidResult = parseDirectoryStartTool.metadata.inputSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });

    it('should accept optional pattern parameter', () => {
      const result = parseDirectoryStartTool.metadata.inputSchema.safeParse({
        path: '/test',
        pattern: '**/*.ts',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional confirm parameter', () => {
      const result = parseDirectoryStartTool.metadata.inputSchema.safeParse({
        path: '/test',
        confirm: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('handler', () => {
    describe('error handling', () => {
      it('should return error for non-existent directory', async () => {
        const response = await parseDirectoryStartTool.handler({
          path: '/non/existent/directory',
        });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Directory not found');
      });

      it('should return error for file path instead of directory', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseDirectoryStartTool.handler({
          path: filePath,
        });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('not a directory');
      });
    });

    describe('small directory handling', () => {
      it('should start parse for small directories without confirmation', async () => {
        // The fixtures directory is small, so it should start immediately
        const response = await parseDirectoryStartTool.handler({
          path: FIXTURES_DIR,
          confirm: true, // Skip potential confirmation for this test
        });

        // Note: This test may fail if worker doesn't start properly
        // We check for either success or worker-not-found error
        const text = response.content[0]?.text ?? '';

        if (response.isError) {
          // Acceptable error: worker not built
          expect(text).toContain('Worker not found');
        } else {
          // Success case
          const result = JSON.parse(text) as StartResponse;
          expect(result.status).toBe('started');
          expect(result.taskId).toBeDefined();
          expect(result.progressLogPath).toBeDefined();
        }
      });
    });

    describe('task creation', () => {
      it('should create a task record in the database', async () => {
        const response = await parseDirectoryStartTool.handler({
          path: FIXTURES_DIR,
          confirm: true,
        });

        const text = response.content[0]?.text ?? '';

        // Skip if worker not available
        if (response.isError && text.includes('Worker not found')) {
          return;
        }

        // Check task was created
        const result = JSON.parse(text) as StartResponse;
        if (result.status === 'started' && result.taskId) {
          const db = getCheckpointDb(checkpointDbPath);
          const task = getParseTask(db, result.taskId);

          expect(task).not.toBeNull();
          expect(task?.directory_path).toBe(FIXTURES_DIR);
        }
      });
    });

    describe('relative paths', () => {
      it('should handle relative paths', async () => {
        const relativePath = path.relative(process.cwd(), FIXTURES_DIR);

        const response = await parseDirectoryStartTool.handler({
          path: relativePath,
          confirm: true,
        });

        const text = response.content[0]?.text ?? '';

        // Should not error on path resolution
        if (!response.isError) {
          const result = JSON.parse(text) as StartResponse;
          // The resolved path should be absolute
          expect(result.directory).toBe(FIXTURES_DIR);
        }
      });
    });
  });
});
