import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabase } from '../connection.js';
import { createMigrationRunner } from '../migrations.js';
import { createFileStore } from '../files.js';
import type Database from 'better-sqlite3';

describe('FileStore', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getDatabase({ filePath: ':memory:' });
    const runner = createMigrationRunner(db);
    runner.run();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('upsertFile', () => {
    it('should insert a new file record', () => {
      const store = createFileStore(db);
      const file = store.upsertFile('/test/file.ts', 'hash123', 'typescript');

      expect(file).toMatchObject({
        filePath: '/test/file.ts',
        contentHash: 'hash123',
        language: 'typescript',
      });
      expect(file.id).toBeTruthy();
      expect(file.updatedAt).toBeTruthy();
    });

    it('should update existing file on upsert', () => {
      const store = createFileStore(db);
      const file1 = store.upsertFile('/test/file.ts', 'hash123', 'typescript');
      const file2 = store.upsertFile('/test/file.ts', 'hash456', 'typescript');

      expect(file2.id).toBe(file1.id);
      expect(file2.contentHash).toBe('hash456');
      // Note: updatedAt may be the same if both operations happen in the same second
      expect(file2.updatedAt).toBeDefined();
    });
  });

  describe('findByPath', () => {
    it('should find file by path', () => {
      const store = createFileStore(db);
      store.upsertFile('/test/file.ts', 'hash123', 'typescript');

      const found = store.findByPath('/test/file.ts');
      expect(found).toMatchObject({
        filePath: '/test/file.ts',
        contentHash: 'hash123',
      });
    });

    it('should return null for non-existent path', () => {
      const store = createFileStore(db);
      const found = store.findByPath('/nonexistent.ts');
      expect(found).toBeNull();
    });
  });

  describe('findByHash', () => {
    it('should find files by hash', () => {
      const store = createFileStore(db);
      store.upsertFile('/test/file1.ts', 'hash123', 'typescript');
      store.upsertFile('/test/file2.ts', 'hash123', 'typescript');

      const found = store.findByHash('hash123');
      expect(found).toHaveLength(2);
      expect(found.map((f) => f.filePath)).toContain('/test/file1.ts');
      expect(found.map((f) => f.filePath)).toContain('/test/file2.ts');
    });

    it('should return empty array for non-existent hash', () => {
      const store = createFileStore(db);
      const found = store.findByHash('nonexistent');
      expect(found).toEqual([]);
    });
  });

  describe('deleteByPath', () => {
    it('should delete file by path', () => {
      const store = createFileStore(db);
      store.upsertFile('/test/file.ts', 'hash123', 'typescript');

      const deleted = store.deleteByPath('/test/file.ts');
      expect(deleted).toBe(true);

      const found = store.findByPath('/test/file.ts');
      expect(found).toBeNull();
    });

    it('should return false for non-existent path', () => {
      const store = createFileStore(db);
      const deleted = store.deleteByPath('/nonexistent.ts');
      expect(deleted).toBe(false);
    });
  });

  describe('getStaleFiles', () => {
    it('should return files not in current paths', () => {
      const store = createFileStore(db);
      store.upsertFile('/test/file1.ts', 'hash1', 'typescript');
      store.upsertFile('/test/file2.ts', 'hash2', 'typescript');
      store.upsertFile('/test/file3.ts', 'hash3', 'typescript');

      const stale = store.getStaleFiles(['/test/file1.ts', '/test/file3.ts']);
      expect(stale).toHaveLength(1);
      expect(stale[0]?.filePath).toBe('/test/file2.ts');
    });

    it('should return all files when current paths is empty', () => {
      const store = createFileStore(db);
      store.upsertFile('/test/file1.ts', 'hash1', 'typescript');
      store.upsertFile('/test/file2.ts', 'hash2', 'typescript');

      const stale = store.getStaleFiles([]);
      expect(stale).toHaveLength(2);
    });

    it('should return empty array when no stale files', () => {
      const store = createFileStore(db);
      store.upsertFile('/test/file1.ts', 'hash1', 'typescript');

      const stale = store.getStaleFiles(['/test/file1.ts']);
      expect(stale).toEqual([]);
    });
  });
});
