import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabase } from '../../db/connection.js';
import { createMigrationRunner } from '../../db/migrations.js';
import { createEntityStore } from '../../db/entities.js';
import { createFileStore } from '../../db/files.js';
import { createFileProcessor } from '../file-processor.js';
import type Database from 'better-sqlite3';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('FileProcessor', () => {
  let db: Database.Database;
  let tempFile: string;

  beforeEach(() => {
    db = getDatabase({ filePath: ':memory:' });
    const runner = createMigrationRunner(db);
    runner.run();
  });

  afterEach(async () => {
    if (tempFile) {
      try {
        await unlink(tempFile);
      } catch {
        // Ignore errors if file doesn't exist
      }
    }
    closeDatabase();
  });

  describe('processFile', () => {
    it('should process a new file', async () => {
      tempFile = join(tmpdir(), `test-${Date.now()}.ts`);
      await writeFile(tempFile, 'const x = 1;', 'utf-8');

      const processor = createFileProcessor(db);
      const result = await processor.processFile(tempFile);

      expect(result.action).toBe('created');
      expect(result.entities).toBeDefined();
      expect(result.entities?.length).toBeGreaterThan(0);

      // Verify file is tracked
      const fileStore = createFileStore(db);
      const file = fileStore.findByPath(tempFile);
      expect(file).not.toBeNull();
      expect(file?.language).toBe('typescript');
    });

    it('should update an existing file', async () => {
      tempFile = join(tmpdir(), `test-${Date.now()}.ts`);
      await writeFile(tempFile, 'const x = 1;', 'utf-8');

      const processor = createFileProcessor(db);

      // First process
      const result1 = await processor.processFile(tempFile);
      expect(result1.action).toBe('created');
      const entityCount1 = result1.entities?.length || 0;

      // Update file content
      await writeFile(tempFile, 'const x = 1;\nconst y = 2;', 'utf-8');

      // Second process
      const result2 = await processor.processFile(tempFile);
      expect(result2.action).toBe('updated');

      // Verify old entities replaced
      const entityStore = createEntityStore(db);
      const entities = entityStore.findByFile(tempFile);
      expect(entities.length).toBe(entityCount1); // Should have same structure
    });

    it('should skip unchanged file when checkHash is true', async () => {
      tempFile = join(tmpdir(), `test-${Date.now()}.ts`);
      await writeFile(tempFile, 'const x = 1;', 'utf-8');

      const processor = createFileProcessor(db, { checkHash: true });

      // First process
      const result1 = await processor.processFile(tempFile);
      expect(result1.action).toBe('created');

      // Second process (no changes)
      const result2 = await processor.processFile(tempFile);
      expect(result2.action).toBe('skipped');
      expect(result2.entities).toBeDefined();
    });

    it('should reprocess changed file when checkHash is true', async () => {
      tempFile = join(tmpdir(), `test-${Date.now()}.ts`);
      await writeFile(tempFile, 'const x = 1;', 'utf-8');

      const processor = createFileProcessor(db, { checkHash: true });

      // First process
      const result1 = await processor.processFile(tempFile);
      expect(result1.action).toBe('created');

      // Update file
      await writeFile(tempFile, 'const x = 2;', 'utf-8');

      // Second process (changed content)
      const result2 = await processor.processFile(tempFile);
      expect(result2.action).toBe('updated');
    });

    it('should return error for unsupported language', async () => {
      tempFile = join(tmpdir(), `test-${Date.now()}.xyz`);
      await writeFile(tempFile, 'some content', 'utf-8');

      const processor = createFileProcessor(db);
      const result = await processor.processFile(tempFile);

      expect(result.action).toBe('error');
      expect(result.error).toContain('Cannot detect language');
    });

    it('should return error for non-existent file', async () => {
      const processor = createFileProcessor(db);
      const result = await processor.processFile('/nonexistent/file.ts');

      expect(result.action).toBe('error');
      expect(result.error).toContain('Failed to read file');
    });
  });

  describe('removeStaleFiles', () => {
    it('should remove files not in current paths', async () => {
      const file1 = join(tmpdir(), `test1-${Date.now()}.ts`);
      const file2 = join(tmpdir(), `test2-${Date.now()}.ts`);
      const file3 = join(tmpdir(), `test3-${Date.now()}.ts`);

      await writeFile(file1, 'const x = 1;', 'utf-8');
      await writeFile(file2, 'const y = 2;', 'utf-8');
      await writeFile(file3, 'const z = 3;', 'utf-8');

      const processor = createFileProcessor(db);

      // Process all files
      await processor.processFile(file1);
      await processor.processFile(file2);
      await processor.processFile(file3);

      // Remove stale (keep only file1 and file3)
      const results = processor.removeStaleFiles([file1, file3]);

      expect(results).toHaveLength(1);
      expect(results[0]?.filePath).toBe(file2);
      expect(results[0]?.action).toBe('deleted');

      // Verify file2 is gone
      const entityStore = createEntityStore(db);
      expect(entityStore.findByFile(file2)).toHaveLength(0);

      const fileStore = createFileStore(db);
      expect(fileStore.findByPath(file2)).toBeNull();

      // Cleanup
      await unlink(file1);
      await unlink(file2);
      await unlink(file3);
    });

    it('should return empty array when no stale files', async () => {
      tempFile = join(tmpdir(), `test-${Date.now()}.ts`);
      await writeFile(tempFile, 'const x = 1;', 'utf-8');

      const processor = createFileProcessor(db);
      await processor.processFile(tempFile);

      const results = processor.removeStaleFiles([tempFile]);

      expect(results).toEqual([]);
    });
  });
});
