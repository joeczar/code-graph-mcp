import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase } from '../connection.js';
import { initializeSchema } from '../schema.js';
import { createEntityStore, type EntityStore, type NewEntity } from '../entities.js';

describe('EntityStore', () => {
  let store: EntityStore;

  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
    store = createEntityStore(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  const sampleEntity: NewEntity = {
    type: 'function',
    name: 'greet',
    filePath: '/src/utils.ts',
    startLine: 10,
    endLine: 15,
    language: 'typescript',
  };

  describe('create', () => {
    it('creates an entity with generated id', () => {
      const entity = store.create(sampleEntity);

      expect(entity.id).toBeDefined();
      expect(entity.id.length).toBeGreaterThan(0);
      expect(entity.name).toBe('greet');
      expect(entity.type).toBe('function');
    });

    it('stores metadata as JSON', () => {
      const withMetadata: NewEntity = {
        ...sampleEntity,
        metadata: { isExported: true, docString: 'Greets the user' },
      };
      const entity = store.create(withMetadata);

      expect(entity.metadata).toEqual({
        isExported: true,
        docString: 'Greets the user',
      });
    });

    it('sets timestamps', () => {
      const entity = store.create(sampleEntity);

      expect(entity.createdAt).toBeDefined();
      expect(entity.updatedAt).toBeDefined();
    });
  });

  describe('findById', () => {
    it('finds an existing entity', () => {
      const created = store.create(sampleEntity);
      const found = store.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('greet');
    });

    it('returns null for non-existent id', () => {
      const found = store.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findByName', () => {
    it('finds entities by name', () => {
      store.create(sampleEntity);
      store.create({ ...sampleEntity, name: 'other' });

      const found = store.findByName('greet');

      expect(found).toHaveLength(1);
      expect(found[0]?.name).toBe('greet');
    });

    it('returns multiple entities with same name', () => {
      store.create(sampleEntity);
      store.create({ ...sampleEntity, filePath: '/src/other.ts' });

      const found = store.findByName('greet');

      expect(found).toHaveLength(2);
    });

    it('returns empty array when no match', () => {
      const found = store.findByName('nonexistent');
      expect(found).toHaveLength(0);
    });
  });

  describe('findByFile', () => {
    it('finds all entities in a file', () => {
      store.create(sampleEntity);
      store.create({
        ...sampleEntity,
        name: 'helper',
        startLine: 20,
        endLine: 25,
      });
      store.create({ ...sampleEntity, filePath: '/src/other.ts' });

      const found = store.findByFile('/src/utils.ts');

      expect(found).toHaveLength(2);
    });
  });

  describe('findByType', () => {
    it('finds entities by type', () => {
      store.create(sampleEntity);
      store.create({ ...sampleEntity, type: 'class', name: 'Calculator' });

      const functions = store.findByType('function');
      const classes = store.findByType('class');

      expect(functions).toHaveLength(1);
      expect(classes).toHaveLength(1);
      expect(functions[0]?.name).toBe('greet');
      expect(classes[0]?.name).toBe('Calculator');
    });
  });

  describe('update', () => {
    it('updates entity fields', () => {
      const created = store.create(sampleEntity);
      const updated = store.update(created.id, { name: 'newName' });

      expect(updated?.name).toBe('newName');
      expect(updated?.type).toBe('function');
    });

    it('updates metadata', () => {
      const created = store.create(sampleEntity);
      const updated = store.update(created.id, {
        metadata: { updated: true },
      });

      expect(updated?.metadata).toEqual({ updated: true });
    });

    it('returns null for non-existent id', () => {
      const updated = store.update('non-existent', { name: 'newName' });
      expect(updated).toBeNull();
    });

    it('updates updatedAt timestamp', () => {
      const created = store.create(sampleEntity);
      const updated = store.update(created.id, { name: 'newName' });

      expect(updated?.updatedAt).toBeDefined();
    });
  });

  describe('delete', () => {
    it('deletes an existing entity', () => {
      const created = store.create(sampleEntity);
      const deleted = store.delete(created.id);

      expect(deleted).toBe(true);
      expect(store.findById(created.id)).toBeNull();
    });

    it('returns false for non-existent entity', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByFile', () => {
    it('deletes all entities in a file', () => {
      store.create(sampleEntity);
      store.create({
        ...sampleEntity,
        name: 'helper',
        startLine: 20,
        endLine: 25,
      });
      store.create({ ...sampleEntity, filePath: '/src/other.ts' });

      const deletedCount = store.deleteByFile('/src/utils.ts');

      expect(deletedCount).toBe(2);
      expect(store.findByFile('/src/utils.ts')).toHaveLength(0);
      expect(store.findByFile('/src/other.ts')).toHaveLength(1);
    });

    it('returns 0 when no entities match', () => {
      const deletedCount = store.deleteByFile('/nonexistent.ts');
      expect(deletedCount).toBe(0);
    });
  });

  describe('count', () => {
    it('returns the total number of entities', () => {
      expect(store.count()).toBe(0);

      store.create(sampleEntity);
      expect(store.count()).toBe(1);

      store.create({ ...sampleEntity, name: 'other' });
      expect(store.count()).toBe(2);
    });
  });
});
