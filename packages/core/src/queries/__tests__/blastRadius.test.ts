import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../db/schema.js';
import { createEntityStore, type EntityStore } from '../../db/entities.js';
import {
  createRelationshipStore,
  type RelationshipStore,
} from '../../db/relationships.js';
import { blastRadius } from '../blastRadius.js';

describe('blastRadius', () => {
  let db: Database.Database;
  let entityStore: EntityStore;
  let relationshipStore: RelationshipStore;

  beforeEach(() => {
    // Create in-memory database for each test
    db = new Database(':memory:');
    initializeSchema(db);
    entityStore = createEntityStore(db);
    relationshipStore = createRelationshipStore(db);
  });

  it('should return empty result for non-existent file', () => {
    const result = blastRadius(
      '/nonexistent.ts',
      entityStore,
      relationshipStore
    );

    expect(result.sourceFile).toBe('/nonexistent.ts');
    expect(result.sourceEntities).toEqual([]);
    expect(result.affectedEntities).toEqual([]);
    expect(result.summary).toEqual({
      totalAffected: 0,
      maxDepth: 0,
      directDependents: 0,
    });
  });

  it('should return empty result for file with no dependents', () => {
    // Create an isolated entity
    entityStore.create({
      type: 'function',
      name: 'isolated',
      filePath: '/src/isolated.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = blastRadius('/src/isolated.ts', entityStore, relationshipStore);

    expect(result.sourceFile).toBe('/src/isolated.ts');
    expect(result.sourceEntities).toHaveLength(1);
    expect(result.affectedEntities).toEqual([]);
    expect(result.summary).toEqual({
      totalAffected: 0,
      maxDepth: 0,
      directDependents: 0,
    });
  });

  it('should find direct dependents (depth 0)', () => {
    // Create source entity
    const source = entityStore.create({
      type: 'function',
      name: 'add',
      filePath: '/src/math.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Create dependent entity
    const dependent = entityStore.create({
      type: 'function',
      name: 'calculate',
      filePath: '/src/calculator.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // Create dependency relationship (dependent calls source)
    relationshipStore.create({
      sourceId: dependent.id,
      targetId: source.id,
      type: 'calls',
    });

    const result = blastRadius('/src/math.ts', entityStore, relationshipStore);

    expect(result.sourceFile).toBe('/src/math.ts');
    expect(result.sourceEntities).toHaveLength(1);
    expect(result.affectedEntities).toHaveLength(1);
    expect(result.affectedEntities[0].entity.name).toBe('calculate');
    expect(result.affectedEntities[0].depth).toBe(0);
    expect(result.summary).toEqual({
      totalAffected: 1,
      maxDepth: 0,
      directDependents: 1,
    });
  });

  it('should find transitive dependencies (multiple depths)', () => {
    // Create chain: A <- B <- C
    const a = entityStore.create({
      type: 'function',
      name: 'a',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const b = entityStore.create({
      type: 'function',
      name: 'b',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const c = entityStore.create({
      type: 'function',
      name: 'c',
      filePath: '/src/c.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // B calls A
    relationshipStore.create({
      sourceId: b.id,
      targetId: a.id,
      type: 'calls',
    });

    // C calls B
    relationshipStore.create({
      sourceId: c.id,
      targetId: b.id,
      type: 'calls',
    });

    const result = blastRadius('/src/a.ts', entityStore, relationshipStore);

    expect(result.sourceEntities).toHaveLength(1);
    expect(result.affectedEntities).toHaveLength(2);

    // B should be at depth 0
    const bResult = result.affectedEntities.find(ae => ae.entity.name === 'b');
    expect(bResult).toBeDefined();
    expect(bResult!.depth).toBe(0);

    // C should be at depth 1
    const cResult = result.affectedEntities.find(ae => ae.entity.name === 'c');
    expect(cResult).toBeDefined();
    expect(cResult!.depth).toBe(1);

    expect(result.summary).toEqual({
      totalAffected: 2,
      maxDepth: 1,
      directDependents: 1,
    });
  });

  it('should respect depth limit', () => {
    // Create chain: A <- B <- C <- D
    const a = entityStore.create({
      type: 'function',
      name: 'a',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const b = entityStore.create({
      type: 'function',
      name: 'b',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const c = entityStore.create({
      type: 'function',
      name: 'c',
      filePath: '/src/c.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const d = entityStore.create({
      type: 'function',
      name: 'd',
      filePath: '/src/d.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: b.id,
      targetId: a.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: c.id,
      targetId: b.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: d.id,
      targetId: c.id,
      type: 'calls',
    });

    // Limit to depth 1, should only get B and C
    const result = blastRadius('/src/a.ts', entityStore, relationshipStore, 2);

    expect(result.affectedEntities).toHaveLength(2);
    expect(result.affectedEntities.map(ae => ae.entity.name).sort()).toEqual([
      'b',
      'c',
    ]);
    expect(result.summary.maxDepth).toBe(1);
  });

  it('should handle cycles without infinite loop', () => {
    // Create cycle: A <- B <- C <- A
    const a = entityStore.create({
      type: 'function',
      name: 'a',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const b = entityStore.create({
      type: 'function',
      name: 'b',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const c = entityStore.create({
      type: 'function',
      name: 'c',
      filePath: '/src/c.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: b.id,
      targetId: a.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: c.id,
      targetId: b.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: a.id,
      targetId: c.id,
      type: 'calls',
    });

    const result = blastRadius('/src/a.ts', entityStore, relationshipStore);

    // Should visit B and C only once each
    expect(result.affectedEntities).toHaveLength(2);
    expect(result.affectedEntities.map(ae => ae.entity.name).sort()).toEqual([
      'b',
      'c',
    ]);
  });

  it('should handle branching dependencies', () => {
    // Create diamond: A <- B, A <- C, B <- D, C <- D
    const a = entityStore.create({
      type: 'function',
      name: 'a',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const b = entityStore.create({
      type: 'function',
      name: 'b',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const c = entityStore.create({
      type: 'function',
      name: 'c',
      filePath: '/src/c.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const d = entityStore.create({
      type: 'function',
      name: 'd',
      filePath: '/src/d.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: b.id,
      targetId: a.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: c.id,
      targetId: a.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: d.id,
      targetId: b.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: d.id,
      targetId: c.id,
      type: 'calls',
    });

    const result = blastRadius('/src/a.ts', entityStore, relationshipStore);

    expect(result.affectedEntities).toHaveLength(3);

    // B and C should be at depth 0
    const depth0 = result.affectedEntities.filter(ae => ae.depth === 0);
    expect(depth0).toHaveLength(2);
    expect(depth0.map(ae => ae.entity.name).sort()).toEqual(['b', 'c']);

    // D should be at depth 1
    const depth1 = result.affectedEntities.filter(ae => ae.depth === 1);
    expect(depth1).toHaveLength(1);
    expect(depth1[0].entity.name).toBe('d');

    expect(result.summary).toEqual({
      totalAffected: 3,
      maxDepth: 1,
      directDependents: 2,
    });
  });

  it('should handle multiple source entities in the same file', () => {
    // Create two functions in the same file
    const add = entityStore.create({
      type: 'function',
      name: 'add',
      filePath: '/src/math.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const multiply = entityStore.create({
      type: 'function',
      name: 'multiply',
      filePath: '/src/math.ts',
      startLine: 7,
      endLine: 11,
      language: 'typescript',
    });

    // Create dependents for each
    const calcA = entityStore.create({
      type: 'function',
      name: 'calcA',
      filePath: '/src/calcA.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const calcB = entityStore.create({
      type: 'function',
      name: 'calcB',
      filePath: '/src/calcB.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: calcA.id,
      targetId: add.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: calcB.id,
      targetId: multiply.id,
      type: 'calls',
    });

    const result = blastRadius('/src/math.ts', entityStore, relationshipStore);

    expect(result.sourceEntities).toHaveLength(2);
    expect(result.affectedEntities).toHaveLength(2);
    expect(result.affectedEntities.map(ae => ae.entity.name).sort()).toEqual([
      'calcA',
      'calcB',
    ]);
    expect(result.summary.directDependents).toBe(2);
  });

  it('should only traverse dependency relationship types', () => {
    const parent = entityStore.create({
      type: 'class',
      name: 'Parent',
      filePath: '/src/parent.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const method = entityStore.create({
      type: 'method',
      name: 'parentMethod',
      filePath: '/src/parent.ts',
      startLine: 2,
      endLine: 5,
      language: 'typescript',
    });

    const caller = entityStore.create({
      type: 'function',
      name: 'caller',
      filePath: '/src/caller.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Contains relationship (should NOT be traversed)
    relationshipStore.create({
      sourceId: parent.id,
      targetId: method.id,
      type: 'contains',
    });

    // Calls relationship (should be traversed)
    relationshipStore.create({
      sourceId: caller.id,
      targetId: parent.id,
      type: 'calls',
    });

    const result = blastRadius('/src/parent.ts', entityStore, relationshipStore);

    // Should only find 'caller', not 'method' (contains is not a dependency)
    expect(result.affectedEntities).toHaveLength(1);
    expect(result.affectedEntities[0].entity.name).toBe('caller');
  });

  it('should handle different dependency types (calls, imports, extends, implements)', () => {
    const base = entityStore.create({
      type: 'class',
      name: 'Base',
      filePath: '/src/base.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const caller = entityStore.create({
      type: 'function',
      name: 'caller',
      filePath: '/src/caller.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const importer = entityStore.create({
      type: 'module',
      name: 'importer',
      filePath: '/src/importer.ts',
      startLine: 1,
      endLine: 1,
      language: 'typescript',
    });

    const extender = entityStore.create({
      type: 'class',
      name: 'Extender',
      filePath: '/src/extender.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const implementer = entityStore.create({
      type: 'class',
      name: 'Implementer',
      filePath: '/src/implementer.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: caller.id,
      targetId: base.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: importer.id,
      targetId: base.id,
      type: 'imports',
    });

    relationshipStore.create({
      sourceId: extender.id,
      targetId: base.id,
      type: 'extends',
    });

    relationshipStore.create({
      sourceId: implementer.id,
      targetId: base.id,
      type: 'implements',
    });

    const result = blastRadius('/src/base.ts', entityStore, relationshipStore);

    expect(result.affectedEntities).toHaveLength(4);
    expect(result.affectedEntities.map(ae => ae.entity.name).sort()).toEqual([
      'Extender',
      'Implementer',
      'caller',
      'importer',
    ]);
  });
});
