import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase } from '../connection.js';
import { initializeSchema } from '../schema.js';
import { createEntityStore, type EntityStore } from '../entities.js';
import {
  createRelationshipStore,
  type RelationshipStore,
  type NewRelationship,
} from '../relationships.js';

describe('RelationshipStore', () => {
  let entityStore: EntityStore;
  let store: RelationshipStore;
  let sourceId: string;
  let targetId: string;

  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
    entityStore = createEntityStore(db);
    store = createRelationshipStore(db);

    // Create test entities
    const source = entityStore.create({
      type: 'function',
      name: 'caller',
      filePath: '/src/caller.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });
    const target = entityStore.create({
      type: 'function',
      name: 'callee',
      filePath: '/src/callee.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    sourceId = source.id;
    targetId = target.id;
  });

  afterEach(() => {
    resetDatabase();
  });

  const createSampleRelationship = (): NewRelationship => ({
    sourceId,
    targetId,
    type: 'calls',
  });

  describe('create', () => {
    it('creates a relationship with generated id', () => {
      const rel = store.create(createSampleRelationship());

      expect(rel.id).toBeDefined();
      expect(rel.sourceId).toBe(sourceId);
      expect(rel.targetId).toBe(targetId);
      expect(rel.type).toBe('calls');
    });

    it('stores metadata as JSON', () => {
      const rel = store.create({
        ...createSampleRelationship(),
        metadata: { isAsync: true, lineNumber: 42 },
      });

      expect(rel.metadata).toEqual({ isAsync: true, lineNumber: 42 });
    });

    it('sets createdAt timestamp', () => {
      const rel = store.create(createSampleRelationship());
      expect(rel.createdAt).toBeDefined();
    });

    it('enforces unique constraint on source, target, type', () => {
      store.create(createSampleRelationship());

      expect(() => store.create(createSampleRelationship())).toThrow();
    });

    it('throws error when source entity does not exist', () => {
      expect(() =>
        store.create({
          sourceId: 'nonexistent-source-id',
          targetId: targetId,
          type: 'calls',
        })
      ).toThrow();
    });

    it('throws error when target entity does not exist', () => {
      expect(() =>
        store.create({
          sourceId: sourceId,
          targetId: 'nonexistent-target-id',
          type: 'calls',
        })
      ).toThrow();
    });
  });

  describe('createBatch', () => {
    let thirdEntityId: string;

    beforeEach(() => {
      // Create a third entity for additional relationships
      const third = entityStore.create({
        type: 'function',
        name: 'helper',
        filePath: '/src/helper.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });
      thirdEntityId = third.id;
    });

    it('inserts multiple relationships at once', () => {
      const relationships: NewRelationship[] = [
        { sourceId, targetId, type: 'calls' },
        { sourceId, targetId: thirdEntityId, type: 'imports' },
        { sourceId: thirdEntityId, targetId, type: 'calls' },
      ];

      const created = store.createBatch(relationships);

      expect(created).toHaveLength(3);
      expect(store.count()).toBe(3);
    });

    it('generates unique IDs for each relationship', () => {
      const relationships: NewRelationship[] = [
        { sourceId, targetId, type: 'calls' },
        { sourceId, targetId: thirdEntityId, type: 'imports' },
      ];

      const created = store.createBatch(relationships);

      expect(created[0]?.id).toBeDefined();
      expect(created[1]?.id).toBeDefined();
      expect(created[0]?.id).not.toBe(created[1]?.id);
    });

    it('preserves metadata', () => {
      const relationships: NewRelationship[] = [
        { sourceId, targetId, type: 'calls', metadata: { line: 10 } },
        { sourceId, targetId: thirdEntityId, type: 'imports', metadata: { async: true } },
      ];

      const created = store.createBatch(relationships);

      expect(created[0]?.metadata).toEqual({ line: 10 });
      expect(created[1]?.metadata).toEqual({ async: true });
    });

    it('returns empty array for empty input', () => {
      const created = store.createBatch([]);

      expect(created).toHaveLength(0);
      expect(store.count()).toBe(0);
    });

    it('silently ignores duplicate relationships', () => {
      const relationships: NewRelationship[] = [
        { sourceId, targetId, type: 'calls' },
        { sourceId, targetId, type: 'calls' }, // Duplicate
        { sourceId, targetId: thirdEntityId, type: 'imports' },
      ];

      const created = store.createBatch(relationships);

      // Only 2 unique relationships should be inserted
      expect(created).toHaveLength(2);
      expect(store.count()).toBe(2);
    });

    it('does not throw on duplicate - uses INSERT OR IGNORE', () => {
      // Insert one relationship first
      store.create({ sourceId, targetId, type: 'calls' });

      // Batch insert including the same relationship
      const relationships: NewRelationship[] = [
        { sourceId, targetId, type: 'calls' }, // Duplicate
        { sourceId, targetId: thirdEntityId, type: 'imports' },
      ];

      // Should not throw
      const created = store.createBatch(relationships);

      // Only the new relationship should be in the result
      expect(created).toHaveLength(1);
      expect(created[0]?.targetId).toBe(thirdEntityId);
      expect(store.count()).toBe(2);
    });

    it('relationships can be found after batch insert', () => {
      const relationships: NewRelationship[] = [
        { sourceId, targetId, type: 'calls' },
        { sourceId, targetId: thirdEntityId, type: 'imports' },
      ];

      const created = store.createBatch(relationships);

      const found1 = store.findById(created[0]!.id);
      const found2 = store.findById(created[1]!.id);

      expect(found1?.type).toBe('calls');
      expect(found2?.type).toBe('imports');
    });
  });

  describe('findById', () => {
    it('finds an existing relationship', () => {
      const created = store.create(createSampleRelationship());
      const found = store.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('returns null for non-existent id', () => {
      const found = store.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findBySource', () => {
    it('finds relationships by source entity', () => {
      store.create(createSampleRelationship());

      const found = store.findBySource(sourceId);

      expect(found).toHaveLength(1);
      expect(found[0]?.sourceId).toBe(sourceId);
    });

    it('returns empty array when no relationships', () => {
      const found = store.findBySource('non-existent');
      expect(found).toHaveLength(0);
    });
  });

  describe('findByTarget', () => {
    it('finds relationships by target entity', () => {
      store.create(createSampleRelationship());

      const found = store.findByTarget(targetId);

      expect(found).toHaveLength(1);
      expect(found[0]?.targetId).toBe(targetId);
    });
  });

  describe('findByType', () => {
    it('finds relationships by type', () => {
      store.create(createSampleRelationship());

      // Create another entity for different relationship
      const other = entityStore.create({
        type: 'class',
        name: 'Base',
        filePath: '/src/base.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      store.create({
        sourceId,
        targetId: other.id,
        type: 'extends',
      });

      const calls = store.findByType('calls');
      const extends_ = store.findByType('extends');

      expect(calls).toHaveLength(1);
      expect(extends_).toHaveLength(1);
    });
  });

  describe('findBetween', () => {
    it('finds all relationships between two entities', () => {
      store.create(createSampleRelationship());
      store.create({
        sourceId,
        targetId,
        type: 'imports',
      });

      const found = store.findBetween(sourceId, targetId);

      expect(found).toHaveLength(2);
    });

    it('returns empty array when no relationships exist', () => {
      const found = store.findBetween(sourceId, targetId);
      expect(found).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('deletes an existing relationship', () => {
      const created = store.create(createSampleRelationship());
      const deleted = store.delete(created.id);

      expect(deleted).toBe(true);
      expect(store.findById(created.id)).toBeNull();
    });

    it('returns false for non-existent relationship', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByEntity', () => {
    it('deletes all relationships involving an entity', () => {
      // Create another entity
      const other = entityStore.create({
        type: 'function',
        name: 'other',
        filePath: '/src/other.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // sourceId -> targetId
      store.create(createSampleRelationship());
      // other -> sourceId (sourceId is target here)
      store.create({
        sourceId: other.id,
        targetId: sourceId,
        type: 'calls',
      });

      const deletedCount = store.deleteByEntity(sourceId);

      expect(deletedCount).toBe(2);
      expect(store.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('returns the total number of relationships', () => {
      expect(store.count()).toBe(0);

      store.create(createSampleRelationship());
      expect(store.count()).toBe(1);
    });
  });

  describe('countByType', () => {
    it('returns counts grouped by relationship type', () => {
      // Create additional entities
      const other = entityStore.create({
        type: 'class',
        name: 'Base',
        filePath: '/src/base.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      store.create({ sourceId, targetId, type: 'calls' });
      store.create({ sourceId, targetId: other.id, type: 'imports' });
      store.create({ sourceId: other.id, targetId, type: 'imports' });
      store.create({ sourceId: other.id, targetId, type: 'extends' });

      const counts = store.countByType();

      expect(counts.calls).toBe(1);
      expect(counts.imports).toBe(2);
      expect(counts.extends).toBe(1);
      expect(counts.implements).toBe(0);
      expect(counts.contains).toBe(0);
    });

    it('returns all zeros for empty database', () => {
      const counts = store.countByType();

      expect(counts.calls).toBe(0);
      expect(counts.imports).toBe(0);
      expect(counts.extends).toBe(0);
      expect(counts.implements).toBe(0);
      expect(counts.contains).toBe(0);
    });
  });

  describe('cascading delete', () => {
    it('deletes relationships when source entity is deleted', () => {
      store.create(createSampleRelationship());
      expect(store.count()).toBe(1);

      entityStore.delete(sourceId);
      expect(store.count()).toBe(0);
    });

    it('deletes relationships when target entity is deleted', () => {
      store.create(createSampleRelationship());
      expect(store.count()).toBe(1);

      entityStore.delete(targetId);
      expect(store.count()).toBe(0);
    });
  });
});
