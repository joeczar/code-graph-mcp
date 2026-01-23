import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../db/schema.js';
import { createEntityStore, type EntityStore } from '../../db/entities.js';
import {
  createRelationshipStore,
  type RelationshipStore,
} from '../../db/relationships.js';
import { findDeadCode } from '../deadCodeDetection.js';

describe('findDeadCode', () => {
  let db: Database.Database;
  let entityStore: EntityStore;
  let relationshipStore: RelationshipStore;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    entityStore = createEntityStore(db);
    relationshipStore = createRelationshipStore(db);
  });

  it('should return empty result when no entities exist', () => {
    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toEqual([]);
    expect(result.summary).toEqual({
      totalUnused: 0,
      byType: {},
      byConfidence: { high: 0, medium: 0, low: 0 },
    });
  });

  it('should detect unused function with no incoming calls', () => {
    entityStore.create({
      type: 'function',
      name: 'unusedFunction',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('unusedFunction');
    expect(result.unusedEntities[0]?.confidence).toBe('high');
    expect(result.unusedEntities[0]?.reason).toBe(
      'No incoming calls and not exported'
    );
    expect(result.summary.totalUnused).toBe(1);
    expect(result.summary.byType).toEqual({ function: 1 });
    expect(result.summary.byConfidence.high).toBe(1);
  });

  it('should detect unused class', () => {
    entityStore.create({
      type: 'class',
      name: 'UnusedClass',
      filePath: '/src/models.ts',
      startLine: 1,
      endLine: 20,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('UnusedClass');
    expect(result.unusedEntities[0]?.entity.type).toBe('class');
  });

  it('should detect unused method', () => {
    entityStore.create({
      type: 'method',
      name: 'unusedMethod',
      filePath: '/src/service.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('unusedMethod');
    expect(result.unusedEntities[0]?.entity.type).toBe('method');
  });

  it('should NOT detect function with incoming calls', () => {
    const used = entityStore.create({
      type: 'function',
      name: 'usedFunction',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const caller = entityStore.create({
      type: 'function',
      name: 'caller',
      filePath: '/src/caller.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: caller.id,
      targetId: used.id,
      type: 'calls',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    // usedFunction is called, but caller has no incoming calls
    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('caller');
  });

  it('should NOT detect class that is extended', () => {
    const base = entityStore.create({
      type: 'class',
      name: 'BaseClass',
      filePath: '/src/base.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const child = entityStore.create({
      type: 'class',
      name: 'ChildClass',
      filePath: '/src/child.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: child.id,
      targetId: base.id,
      type: 'extends',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    // BaseClass is extended, ChildClass is not
    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('ChildClass');
  });

  it('should NOT detect interface that is implemented', () => {
    const iface = entityStore.create({
      type: 'type',
      name: 'IService',
      filePath: '/src/interfaces.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const impl = entityStore.create({
      type: 'class',
      name: 'ServiceImpl',
      filePath: '/src/service.ts',
      startLine: 1,
      endLine: 20,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: impl.id,
      targetId: iface.id,
      type: 'implements',
    });

    // By default, 'type' is not included in entityTypes
    const result = findDeadCode(entityStore, relationshipStore, {
      entityTypes: ['class', 'type'],
    });

    // IService is implemented, ServiceImpl is not used
    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('ServiceImpl');
  });

  it('should exclude entry point files (index.ts)', () => {
    entityStore.create({
      type: 'function',
      name: 'main',
      filePath: '/src/index.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(0);
  });

  it('should exclude entry point files (main.ts)', () => {
    entityStore.create({
      type: 'function',
      name: 'bootstrap',
      filePath: '/src/main.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(0);
  });

  it('should exclude test files by default', () => {
    entityStore.create({
      type: 'function',
      name: 'testHelper',
      filePath: '/src/utils.test.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    entityStore.create({
      type: 'function',
      name: 'specHelper',
      filePath: '/src/utils.spec.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    entityStore.create({
      type: 'function',
      name: 'testDirHelper',
      filePath: '/src/__tests__/helper.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(0);
  });

  it('should include test files when includeTests is true', () => {
    entityStore.create({
      type: 'function',
      name: 'testHelper',
      filePath: '/src/utils.test.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore, {
      includeTests: true,
    });

    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.name).toBe('testHelper');
  });

  it('should exclude lifecycle methods (constructor)', () => {
    entityStore.create({
      type: 'method',
      name: 'constructor',
      filePath: '/src/service.ts',
      startLine: 5,
      endLine: 10,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(0);
  });

  it('should exclude React lifecycle methods', () => {
    const lifecycleMethods = [
      'componentDidMount',
      'componentDidUpdate',
      'componentWillUnmount',
      'render',
    ];

    for (const methodName of lifecycleMethods) {
      entityStore.create({
        type: 'method',
        name: methodName,
        filePath: '/src/Component.tsx',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
      });
    }

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(0);
  });

  it('should exclude Angular lifecycle methods', () => {
    const lifecycleMethods = ['ngOnInit', 'ngOnDestroy', 'ngOnChanges'];

    for (const methodName of lifecycleMethods) {
      entityStore.create({
        type: 'method',
        name: methodName,
        filePath: '/src/component.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
      });
    }

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.unusedEntities).toHaveLength(0);
  });

  it('should give medium confidence to exported entities', () => {
    entityStore.create({
      type: 'function',
      name: 'exportedUnused',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
      metadata: { exported: true },
    });

    const result = findDeadCode(entityStore, relationshipStore, {
      minConfidence: 'medium',
    });

    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.confidence).toBe('medium');
    expect(result.unusedEntities[0]?.reason).toBe(
      'No incoming calls, but exported (might be used externally)'
    );
    expect(result.summary.byConfidence.medium).toBe(1);
  });

  it('should filter by minimum confidence level', () => {
    // Non-exported function (high confidence)
    entityStore.create({
      type: 'function',
      name: 'privateUnused',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Exported function (medium confidence)
    entityStore.create({
      type: 'function',
      name: 'exportedUnused',
      filePath: '/src/utils.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
      metadata: { exported: true },
    });

    // With high confidence filter, only privateUnused
    const highResult = findDeadCode(entityStore, relationshipStore, {
      minConfidence: 'high',
    });
    expect(highResult.unusedEntities).toHaveLength(1);
    expect(highResult.unusedEntities[0]?.entity.name).toBe('privateUnused');

    // With medium confidence filter, both
    const mediumResult = findDeadCode(entityStore, relationshipStore, {
      minConfidence: 'medium',
    });
    expect(mediumResult.unusedEntities).toHaveLength(2);
  });

  it('should track outgoing call count', () => {
    const unused = entityStore.create({
      type: 'function',
      name: 'unused',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const helper1 = entityStore.create({
      type: 'function',
      name: 'helper1',
      filePath: '/src/helpers.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const helper2 = entityStore.create({
      type: 'function',
      name: 'helper2',
      filePath: '/src/helpers.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    // unused calls both helpers
    relationshipStore.create({
      sourceId: unused.id,
      targetId: helper1.id,
      type: 'calls',
    });

    relationshipStore.create({
      sourceId: unused.id,
      targetId: helper2.id,
      type: 'calls',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    // Only 'unused' is dead code - helper1 and helper2 have incoming calls from 'unused'
    expect(result.unusedEntities).toHaveLength(1);

    // Find the 'unused' function and check its outgoingCount
    const unusedResult = result.unusedEntities.find(
      u => u.entity.name === 'unused'
    );
    expect(unusedResult).toBeDefined();
    expect(unusedResult?.entity.name).toBe('unused');
    expect(unusedResult?.outgoingCount).toBe(2);
  });

  it('should respect maxResults limit', () => {
    // Create 5 unused functions
    for (let i = 0; i < 5; i++) {
      entityStore.create({
        type: 'function',
        name: `unused${i.toString()}`,
        filePath: `/src/file${i.toString()}.ts`,
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });
    }

    const result = findDeadCode(entityStore, relationshipStore, {
      maxResults: 3,
    });

    expect(result.unusedEntities).toHaveLength(3);
    expect(result.summary.totalUnused).toBe(3);
  });

  it('should filter by entity types', () => {
    entityStore.create({
      type: 'function',
      name: 'unusedFunction',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    entityStore.create({
      type: 'class',
      name: 'UnusedClass',
      filePath: '/src/models.ts',
      startLine: 1,
      endLine: 20,
      language: 'typescript',
    });

    entityStore.create({
      type: 'method',
      name: 'unusedMethod',
      filePath: '/src/service.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    // Only check functions
    const result = findDeadCode(entityStore, relationshipStore, {
      entityTypes: ['function'],
    });

    expect(result.unusedEntities).toHaveLength(1);
    expect(result.unusedEntities[0]?.entity.type).toBe('function');
  });

  it('should NOT consider imports as usage', () => {
    const imported = entityStore.create({
      type: 'function',
      name: 'importedButNotUsed',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const importer = entityStore.create({
      type: 'module',
      name: 'importer',
      filePath: '/src/consumer.ts',
      startLine: 1,
      endLine: 1,
      language: 'typescript',
    });

    relationshipStore.create({
      sourceId: importer.id,
      targetId: imported.id,
      type: 'imports',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    // importedButNotUsed should still be flagged (imports don't count as usage)
    const importedResult = result.unusedEntities.find(
      u => u.entity.name === 'importedButNotUsed'
    );
    expect(importedResult).toBeDefined();
  });

  it('should sort results by confidence then file path', () => {
    // Exported (medium confidence)
    entityStore.create({
      type: 'function',
      name: 'exportedA',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
      metadata: { exported: true },
    });

    // Non-exported (high confidence)
    entityStore.create({
      type: 'function',
      name: 'privateZ',
      filePath: '/src/z.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Non-exported (high confidence)
    entityStore.create({
      type: 'function',
      name: 'privateA',
      filePath: '/src/a.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore, {
      minConfidence: 'medium',
    });

    expect(result.unusedEntities).toHaveLength(3);

    // High confidence first, sorted by path
    expect(result.unusedEntities[0]?.entity.name).toBe('privateA');
    expect(result.unusedEntities[0]?.confidence).toBe('high');

    expect(result.unusedEntities[1]?.entity.name).toBe('privateZ');
    expect(result.unusedEntities[1]?.confidence).toBe('high');

    // Medium confidence last
    expect(result.unusedEntities[2]?.entity.name).toBe('exportedA');
    expect(result.unusedEntities[2]?.confidence).toBe('medium');
  });

  it('should handle multiple entity types in summary', () => {
    entityStore.create({
      type: 'function',
      name: 'unusedFn1',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    entityStore.create({
      type: 'function',
      name: 'unusedFn2',
      filePath: '/src/utils.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    entityStore.create({
      type: 'class',
      name: 'UnusedClass',
      filePath: '/src/models.ts',
      startLine: 1,
      endLine: 20,
      language: 'typescript',
    });

    entityStore.create({
      type: 'method',
      name: 'unusedMethod',
      filePath: '/src/service.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    const result = findDeadCode(entityStore, relationshipStore);

    expect(result.summary.totalUnused).toBe(4);
    expect(result.summary.byType).toEqual({
      function: 2,
      class: 1,
      method: 1,
    });
  });
});
