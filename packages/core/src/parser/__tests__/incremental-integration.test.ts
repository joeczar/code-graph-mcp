import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabase } from '../../db/connection.js';
import { createMigrationRunner } from '../../db/migrations.js';
import { createFileProcessor } from '../file-processor.js';
import { createEntityStore } from '../../db/entities.js';
import { createFileStore } from '../../db/files.js';
import { createRelationshipStore } from '../../db/relationships.js';
import type Database from 'better-sqlite3';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Integration tests for incremental update functionality.
 * Tests the complete flow of:
 * 1. Store file content hashes
 * 2. Detect changes via hash comparison
 * 3. Remove stale entities on reparse
 * 4. Update relationships correctly (CASCADE)
 */
describe('Incremental Update Integration', () => {
  let db: Database.Database;
  let tempFiles: string[];

  beforeEach(() => {
    db = getDatabase({ filePath: ':memory:' });
    const runner = createMigrationRunner(db);
    runner.run();
    tempFiles = [];
  });

  afterEach(async () => {
    // Cleanup temp files
    for (const file of tempFiles) {
      try {
        await unlink(file);
      } catch {
        // Ignore errors
      }
    }
    closeDatabase();
  });

  async function createTempFile(content: string): Promise<string> {
    const filePath = join(tmpdir(), `test-${String(Date.now())}-${String(Math.random())}.ts`);
    await writeFile(filePath, content, 'utf-8');
    tempFiles.push(filePath);
    return filePath;
  }

  it('should store file content hashes on first parse', async () => {
    const file = await createTempFile('const x = 1;');
    const processor = createFileProcessor(db, { checkHash: true });

    const result = await processor.processFile(file);
    expect(result.action).toBe('created');

    // Verify hash is stored
    const fileStore = createFileStore(db);
    const fileRecord = fileStore.findByPath(file);
    expect(fileRecord).not.toBeNull();
    expect(fileRecord?.contentHash).toBeDefined();
    expect(fileRecord?.contentHash.length).toBe(64); // SHA-256 hex length
  });

  it('should skip unchanged files when checkHash is enabled', async () => {
    const file = await createTempFile('const x = 1;');
    const processor = createFileProcessor(db, { checkHash: true });

    // First parse
    const result1 = await processor.processFile(file);
    expect(result1.action).toBe('created');

    // Second parse without changes
    const result2 = await processor.processFile(file);
    expect(result2.action).toBe('skipped');

    // Verify we still get the existing entities
    expect(result2.entities).toBeDefined();
    expect(result2.entities?.length).toBe(result1.entities?.length);
  });

  it('should detect changes via hash comparison and reparse', async () => {
    const file = await createTempFile('const x = 1;');
    const processor = createFileProcessor(db, { checkHash: true });
    const fileStore = createFileStore(db);

    // First parse
    await processor.processFile(file);
    const hash1 = fileStore.findByPath(file)?.contentHash;

    // Modify file
    await writeFile(file, 'const x = 2;', 'utf-8');

    // Second parse should detect change
    const result = await processor.processFile(file);
    expect(result.action).toBe('updated');

    // Verify hash updated
    const hash2 = fileStore.findByPath(file)?.contentHash;
    expect(hash2).not.toBe(hash1);
  });

  it('should remove stale entities when file is reparsed', async () => {
    const file = await createTempFile('const x = 1;');
    const processor = createFileProcessor(db);
    const entityStore = createEntityStore(db);

    // First parse creates entities
    const result1 = await processor.processFile(file);
    const originalEntityIds = result1.entities?.map((e) => e.id) ?? [];
    expect(originalEntityIds.length).toBeGreaterThan(0);

    // Reparse (no checkHash, always reparse)
    const result2 = await processor.processFile(file);
    const newEntityIds = result2.entities?.map((e) => e.id) ?? [];

    // Verify old entities are gone
    for (const oldId of originalEntityIds) {
      expect(entityStore.findById(oldId)).toBeNull();
    }

    // Verify new entities exist
    for (const newId of newEntityIds) {
      expect(entityStore.findById(newId)).not.toBeNull();
    }
  });

  it('should update relationships correctly via CASCADE on entity deletion', async () => {
    const file = await createTempFile('const x = 1;');
    const processor = createFileProcessor(db);
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    // First parse
    const result1 = await processor.processFile(file);
    const entity = result1.entities?.[0];
    expect(entity).toBeDefined();

    // Create a relationship involving this entity
    const targetEntity = entityStore.create({
      type: 'function',
      name: 'target',
      filePath: '/other/file.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    if (!entity) {
      throw new Error('Entity should exist');
    }

    const relationship = relationshipStore.create({
      sourceId: entity.id,
      targetId: targetEntity.id,
      type: 'calls',
    });

    // Verify relationship exists
    expect(relationshipStore.findById(relationship.id)).not.toBeNull();

    // Reparse file (deletes old entities)
    await processor.processFile(file);

    // Verify relationship was CASCADE deleted
    expect(relationshipStore.findById(relationship.id)).toBeNull();
  });

  it('should handle complete incremental update workflow', async () => {
    const file1 = await createTempFile('const x = 1;');
    const file2 = await createTempFile('const y = 2;');
    const file3 = await createTempFile('const z = 3;');

    const processor = createFileProcessor(db, { checkHash: true });
    const fileStore = createFileStore(db);

    // Initial parse of all files
    await processor.processFile(file1);
    await processor.processFile(file2);
    await processor.processFile(file3);

    // Verify all files tracked
    expect(fileStore.findByPath(file1)).not.toBeNull();
    expect(fileStore.findByPath(file2)).not.toBeNull();
    expect(fileStore.findByPath(file3)).not.toBeNull();

    // Modify file2
    await writeFile(file2, 'const y = 22;', 'utf-8');

    // Reparse all files
    const result1 = await processor.processFile(file1);
    const result2 = await processor.processFile(file2);
    const result3 = await processor.processFile(file3);

    // Verify: file1 and file3 skipped, file2 updated
    expect(result1.action).toBe('skipped');
    expect(result2.action).toBe('updated');
    expect(result3.action).toBe('skipped');

    // Remove file3 from project (simulate deletion)
    const staleResults = processor.removeStaleFiles([file1, file2]);

    expect(staleResults).toHaveLength(1);
    expect(staleResults[0]?.filePath).toBe(file3);
    expect(staleResults[0]?.action).toBe('deleted');

    // Verify file3 removed from database
    expect(fileStore.findByPath(file3)).toBeNull();
  });

  it('should handle hash-based skipping for multiple files efficiently', async () => {
    const files: string[] = [];
    for (let i = 0; i < 5; i++) {
      files.push(await createTempFile(`const x${String(i)} = ${String(i)};`));
    }

    const processor = createFileProcessor(db, { checkHash: true });

    // First parse
    for (const file of files) {
      await processor.processFile(file);
    }

    // Modify only middle file
    const middleFile = files[2];
    if (!middleFile) {
      throw new Error('Middle file should exist');
    }
    await writeFile(middleFile, 'const x2 = 222;', 'utf-8');

    // Reparse all
    const results = await Promise.all(files.map((f) => processor.processFile(f)));

    // Verify only middle file was updated
    expect(results[0]?.action).toBe('skipped');
    expect(results[1]?.action).toBe('skipped');
    expect(results[2]?.action).toBe('updated');
    expect(results[3]?.action).toBe('skipped');
    expect(results[4]?.action).toBe('skipped');
  });

  it('should clean up orphaned relationships when source file is deleted', async () => {
    const file1 = await createTempFile('const x = 1;');
    const file2 = await createTempFile('const y = 2;');

    const processor = createFileProcessor(db);
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    // Parse both files
    const result1 = await processor.processFile(file1);
    const result2 = await processor.processFile(file2);

    const entity1 = result1.entities?.[0];
    const entity2 = result2.entities?.[0];

    if (!entity1 || !entity2) {
      throw new Error('Entities should exist');
    }

    // Create cross-file relationship
    const rel = relationshipStore.create({
      sourceId: entity1.id,
      targetId: entity2.id,
      type: 'imports',
    });

    expect(relationshipStore.findById(rel.id)).not.toBeNull();

    // Remove file1 (stale file scenario)
    const staleResults = processor.removeStaleFiles([file2]);

    expect(staleResults).toHaveLength(1);
    expect(staleResults[0]?.filePath).toBe(file1);

    // Verify relationship was CASCADE deleted
    expect(relationshipStore.findById(rel.id)).toBeNull();

    // Verify entity2 still exists (different file)
    expect(entityStore.findById(entity2.id)).not.toBeNull();
  });
});
