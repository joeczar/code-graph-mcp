import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabase } from '../connection.js';
import { createMigrationRunner } from '../migrations.js';
import { createEntityStore } from '../entities.js';
import { createFileStore } from '../files.js';
import {
  createIncrementalUpdater,
  computeFileHash,
  computeFileHashFromPath,
} from '../incremental-updater.js';
import type Database from 'better-sqlite3';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('IncrementalUpdater', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getDatabase({ filePath: ':memory:' });
    const runner = createMigrationRunner(db);
    runner.run();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('computeFileHash', () => {
    it('should compute consistent hash for same content', () => {
      const content = 'const x = 1;';
      const hash1 = computeFileHash(content);
      const hash2 = computeFileHash(content);
      expect(hash1).toBe(hash2);
    });

    it('should compute different hash for different content', () => {
      const hash1 = computeFileHash('const x = 1;');
      const hash2 = computeFileHash('const x = 2;');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('computeFileHashFromPath', () => {
    it('should compute hash from file content', async () => {
      const tempFile = join(tmpdir(), `test-${Date.now()}.txt`);
      const content = 'test content';
      await writeFile(tempFile, content, 'utf-8');

      const hash = await computeFileHashFromPath(tempFile);
      const expectedHash = computeFileHash(content);

      expect(hash).toBe(expectedHash);

      await unlink(tempFile);
    });

    it('should return null for non-existent file', async () => {
      const hash = await computeFileHashFromPath('/nonexistent/file.txt');
      expect(hash).toBeNull();
    });
  });

  describe('shouldReparse', () => {
    it('should return true for new file', async () => {
      const updater = createIncrementalUpdater(db);
      const shouldReparse = await updater.shouldReparse('/test/new.ts', 'hash123');
      expect(shouldReparse).toBe(true);
    });

    it('should return false if hash unchanged', async () => {
      const updater = createIncrementalUpdater(db);
      updater.markFileUpdated('/test/file.ts', 'hash123', 'typescript');

      const shouldReparse = await updater.shouldReparse('/test/file.ts', 'hash123');
      expect(shouldReparse).toBe(false);
    });

    it('should return true if hash changed', async () => {
      const updater = createIncrementalUpdater(db);
      updater.markFileUpdated('/test/file.ts', 'hash123', 'typescript');

      const shouldReparse = await updater.shouldReparse('/test/file.ts', 'hash456');
      expect(shouldReparse).toBe(true);
    });
  });

  describe('markFileUpdated', () => {
    it('should create new file record', () => {
      const updater = createIncrementalUpdater(db);
      const file = updater.markFileUpdated('/test/file.ts', 'hash123', 'typescript');

      expect(file).toMatchObject({
        filePath: '/test/file.ts',
        contentHash: 'hash123',
        language: 'typescript',
      });
    });

    it('should update existing file record', () => {
      const updater = createIncrementalUpdater(db);
      const file1 = updater.markFileUpdated('/test/file.ts', 'hash123', 'typescript');
      const file2 = updater.markFileUpdated('/test/file.ts', 'hash456', 'typescript');

      expect(file2.id).toBe(file1.id);
      expect(file2.contentHash).toBe('hash456');
    });
  });

  describe('deleteFile', () => {
    it('should delete file and associated entities', () => {
      const entityStore = createEntityStore(db);
      const updater = createIncrementalUpdater(db);

      // Create entities for a file
      entityStore.create({
        type: 'function',
        name: 'testFunc',
        filePath: '/test/file.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });
      entityStore.create({
        type: 'class',
        name: 'TestClass',
        filePath: '/test/file.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      // Mark file as tracked
      updater.markFileUpdated('/test/file.ts', 'hash123', 'typescript');

      const result = updater.deleteFile('/test/file.ts');

      expect(result).toMatchObject({
        filePath: '/test/file.ts',
        action: 'deleted',
        entitiesAffected: 2,
      });

      // Verify entities are deleted
      const remainingEntities = entityStore.findByFile('/test/file.ts');
      expect(remainingEntities).toHaveLength(0);

      // Verify file is deleted
      const fileStore = createFileStore(db);
      const file = fileStore.findByPath('/test/file.ts');
      expect(file).toBeNull();
    });

    it('should return skipped for non-existent file', () => {
      const updater = createIncrementalUpdater(db);
      const result = updater.deleteFile('/nonexistent.ts');

      expect(result).toMatchObject({
        filePath: '/nonexistent.ts',
        action: 'skipped',
        entitiesAffected: 0,
      });
    });
  });

  describe('removeStaleFiles', () => {
    it('should remove files not in current paths', () => {
      const entityStore = createEntityStore(db);
      const updater = createIncrementalUpdater(db);

      // Setup files
      updater.markFileUpdated('/test/file1.ts', 'hash1', 'typescript');
      updater.markFileUpdated('/test/file2.ts', 'hash2', 'typescript');
      updater.markFileUpdated('/test/file3.ts', 'hash3', 'typescript');

      // Add entities
      entityStore.create({
        type: 'function',
        name: 'func1',
        filePath: '/test/file1.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });
      entityStore.create({
        type: 'function',
        name: 'func2',
        filePath: '/test/file2.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Remove stale (only keep file1 and file3)
      const results = updater.removeStaleFiles(['/test/file1.ts', '/test/file3.ts']);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        filePath: '/test/file2.ts',
        action: 'deleted',
        entitiesAffected: 1,
      });

      // Verify file2 is gone
      const fileStore = createFileStore(db);
      expect(fileStore.findByPath('/test/file2.ts')).toBeNull();
      expect(entityStore.findByFile('/test/file2.ts')).toHaveLength(0);

      // Verify file1 and file3 remain
      expect(fileStore.findByPath('/test/file1.ts')).not.toBeNull();
      expect(fileStore.findByPath('/test/file3.ts')).not.toBeNull();
    });

    it('should handle empty current paths', () => {
      const updater = createIncrementalUpdater(db);

      updater.markFileUpdated('/test/file1.ts', 'hash1', 'typescript');
      updater.markFileUpdated('/test/file2.ts', 'hash2', 'typescript');

      const results = updater.removeStaleFiles([]);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.filePath)).toContain('/test/file1.ts');
      expect(results.map((r) => r.filePath)).toContain('/test/file2.ts');
    });

    it('should return empty array when no stale files', () => {
      const updater = createIncrementalUpdater(db);

      updater.markFileUpdated('/test/file1.ts', 'hash1', 'typescript');

      const results = updater.removeStaleFiles(['/test/file1.ts']);

      expect(results).toEqual([]);
    });
  });
});
