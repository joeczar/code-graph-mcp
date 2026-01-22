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

  describe('createBatch', () => {
    it('inserts multiple entities at once', () => {
      const entities: NewEntity[] = [
        { ...sampleEntity, name: 'fn1' },
        { ...sampleEntity, name: 'fn2' },
        { ...sampleEntity, name: 'fn3' },
      ];

      const created = store.createBatch(entities);

      expect(created).toHaveLength(3);
      expect(created[0]?.name).toBe('fn1');
      expect(created[1]?.name).toBe('fn2');
      expect(created[2]?.name).toBe('fn3');
      expect(store.count()).toBe(3);
    });

    it('generates unique IDs for each entity', () => {
      const entities: NewEntity[] = [
        { ...sampleEntity, name: 'fn1' },
        { ...sampleEntity, name: 'fn2' },
      ];

      const created = store.createBatch(entities);

      expect(created[0]?.id).toBeDefined();
      expect(created[1]?.id).toBeDefined();
      expect(created[0]?.id).not.toBe(created[1]?.id);
    });

    it('preserves metadata', () => {
      const entities: NewEntity[] = [
        { ...sampleEntity, name: 'fn1', metadata: { exported: true } },
        { ...sampleEntity, name: 'fn2', metadata: { exported: false } },
      ];

      const created = store.createBatch(entities);

      expect(created[0]?.metadata).toEqual({ exported: true });
      expect(created[1]?.metadata).toEqual({ exported: false });
    });

    it('returns empty array for empty input', () => {
      const created = store.createBatch([]);

      expect(created).toHaveLength(0);
      expect(store.count()).toBe(0);
    });

    it('entities can be found after batch insert', () => {
      const entities: NewEntity[] = [
        { ...sampleEntity, name: 'fn1', filePath: '/src/a.ts' },
        { ...sampleEntity, name: 'fn2', filePath: '/src/b.ts' },
      ];

      const created = store.createBatch(entities);

      const found1 = store.findById(created[0]!.id);
      const found2 = store.findById(created[1]!.id);

      expect(found1?.name).toBe('fn1');
      expect(found2?.name).toBe('fn2');
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

  describe('findByNameAndFile', () => {
    it('finds entity by name and file path', () => {
      store.create(sampleEntity);
      store.create({ ...sampleEntity, name: 'greet', filePath: '/src/other.ts' });

      const found = store.findByNameAndFile('greet', '/src/utils.ts');

      expect(found).not.toBeNull();
      expect(found?.name).toBe('greet');
      expect(found?.filePath).toBe('/src/utils.ts');
    });

    it('returns null when name matches but file path does not', () => {
      store.create(sampleEntity);

      const found = store.findByNameAndFile('greet', '/src/other.ts');

      expect(found).toBeNull();
    });

    it('returns null when file path matches but name does not', () => {
      store.create(sampleEntity);

      const found = store.findByNameAndFile('helper', '/src/utils.ts');

      expect(found).toBeNull();
    });

    it('returns null for non-existent entity', () => {
      const found = store.findByNameAndFile('nonexistent', '/nonexistent.ts');

      expect(found).toBeNull();
    });

    it('returns first match when multiple entities have same name and file (edge case)', () => {
      // This is an edge case - normally name+file should be unique
      // But the method should still work
      store.create(sampleEntity);
      store.create({ ...sampleEntity, startLine: 20, endLine: 25 });

      const found = store.findByNameAndFile('greet', '/src/utils.ts');

      expect(found).not.toBeNull();
      expect(found?.name).toBe('greet');
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

  describe('countByType', () => {
    it('returns counts grouped by entity type', () => {
      store.create({ ...sampleEntity, type: 'function', name: 'fn1' });
      store.create({ ...sampleEntity, type: 'function', name: 'fn2' });
      store.create({ ...sampleEntity, type: 'class', name: 'Class1' });
      store.create({ ...sampleEntity, type: 'method', name: 'method1' });

      const counts = store.countByType();

      expect(counts.function).toBe(2);
      expect(counts.class).toBe(1);
      expect(counts.method).toBe(1);
      expect(counts.module).toBe(0);
      expect(counts.file).toBe(0);
      expect(counts.type).toBe(0);
    });

    it('returns all zeros for empty database', () => {
      const counts = store.countByType();

      expect(counts.function).toBe(0);
      expect(counts.class).toBe(0);
      expect(counts.method).toBe(0);
      expect(counts.module).toBe(0);
      expect(counts.file).toBe(0);
      expect(counts.type).toBe(0);
    });
  });

  describe('getAll', () => {
    it('returns all entities', () => {
      store.create({ ...sampleEntity, name: 'fn1' });
      store.create({ ...sampleEntity, name: 'fn2' });
      store.create({ ...sampleEntity, name: 'fn3' });

      const all = store.getAll();

      expect(all).toHaveLength(3);
      expect(all.map(e => e.name).sort()).toEqual(['fn1', 'fn2', 'fn3']);
    });

    it('returns empty array for empty database', () => {
      const all = store.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('getRecentFiles', () => {
    it('returns files with entity counts sorted by last updated', () => {
      // Create entities in different files
      store.create({ ...sampleEntity, filePath: '/src/old.ts', name: 'old1' });
      store.create({ ...sampleEntity, filePath: '/src/old.ts', name: 'old2' });

      store.create({ ...sampleEntity, filePath: '/src/new.ts', name: 'new1' });
      store.create({ ...sampleEntity, filePath: '/src/new.ts', name: 'new2' });
      store.create({ ...sampleEntity, filePath: '/src/new.ts', name: 'new3' });

      const recent = store.getRecentFiles(10);

      expect(recent).toHaveLength(2);

      // Verify sorting: new.ts should be first (most recently updated)
      expect(recent[0]?.filePath).toBe('/src/new.ts');
      expect(recent[0]?.entityCount).toBe(3);

      // old.ts should be second
      expect(recent[1]?.filePath).toBe('/src/old.ts');
      expect(recent[1]?.entityCount).toBe(2);
    });

    it('respects limit parameter', () => {
      store.create({ ...sampleEntity, filePath: '/src/a.ts' });
      store.create({ ...sampleEntity, filePath: '/src/b.ts' });
      store.create({ ...sampleEntity, filePath: '/src/c.ts' });

      const recent = store.getRecentFiles(2);

      expect(recent).toHaveLength(2);
    });

    it('returns empty array for empty database', () => {
      const recent = store.getRecentFiles(10);
      expect(recent).toHaveLength(0);
    });
  });

  describe('findEntity', () => {
    beforeEach(() => {
      // Create test data
      store.create({ ...sampleEntity, name: 'greet', type: 'function', filePath: '/src/utils.ts' });
      store.create({ ...sampleEntity, name: 'greetUser', type: 'function', filePath: '/src/utils.ts' });
      store.create({ ...sampleEntity, name: 'Calculator', type: 'class', filePath: '/src/calc.ts' });
      store.create({ ...sampleEntity, name: 'calculateSum', type: 'function', filePath: '/src/calc.ts' });
      store.create({ ...sampleEntity, name: 'User', type: 'class', filePath: '/src/models/user.ts' });
    });

    it('searches by name prefix', () => {
      const results = store.findEntity({ namePattern: 'greet', matchMode: 'prefix' });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.name).sort()).toEqual(['greet', 'greetUser']);
    });

    it('searches by name contains', () => {
      const results = store.findEntity({ namePattern: 'calc', matchMode: 'contains' });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.name).sort()).toEqual(['Calculator', 'calculateSum']);
    });

    it('searches by exact name match', () => {
      const results = store.findEntity({ namePattern: 'greet', matchMode: 'exact' });

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('greet');
    });

    it('defaults to contains mode when matchMode not specified', () => {
      const results = store.findEntity({ namePattern: 'calc' });

      expect(results).toHaveLength(2);
    });

    it('filters by entity type', () => {
      const results = store.findEntity({ type: 'class' });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.name).sort()).toEqual(['Calculator', 'User']);
    });

    it('filters by file path', () => {
      const results = store.findEntity({ filePath: '/src/utils.ts' });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.name).sort()).toEqual(['greet', 'greetUser']);
    });

    it('combines multiple filters with AND', () => {
      const results = store.findEntity({
        namePattern: 'greet',
        matchMode: 'prefix',
        type: 'function',
        filePath: '/src/utils.ts',
      });

      expect(results).toHaveLength(2);
      expect(results.map(e => e.name).sort()).toEqual(['greet', 'greetUser']);
    });

    it('combines name and type filters', () => {
      const results = store.findEntity({
        namePattern: 'calc',
        type: 'function',
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('calculateSum');
    });

    it('returns empty array when no matches', () => {
      const results = store.findEntity({ namePattern: 'nonexistent' });

      expect(results).toHaveLength(0);
    });

    it('returns all entities when no filters provided', () => {
      const results = store.findEntity({});

      expect(results).toHaveLength(5);
    });

    it('handles case-sensitive searches', () => {
      const results = store.findEntity({ namePattern: 'GREET', matchMode: 'contains' });

      // SQLite LIKE is case-insensitive by default for ASCII characters
      expect(results).toHaveLength(2);
    });
  });
});
