import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../db/schema.js';
import { createEntityStore } from '../../db/entities.js';
import { createRelationshipStore } from '../../db/relationships.js';
import { findCircularDependencies } from '../circularDependencies.js';

describe('findCircularDependencies', () => {
  let db: Database.Database;
  let entityStore: ReturnType<typeof createEntityStore>;
  let relStore: ReturnType<typeof createRelationshipStore>;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    entityStore = createEntityStore(db);
    relStore = createRelationshipStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should find a simple A -> B -> A cycle', () => {
    const entityA = entityStore.create({
      type: 'class',
      name: 'ClassA',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB = entityStore.create({
      type: 'class',
      name: 'ClassB',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // A -> B
    relStore.create({
      sourceId: entityA.id,
      targetId: entityB.id,
      type: 'calls',
    });

    // B -> A (creates cycle)
    relStore.create({
      sourceId: entityB.id,
      targetId: entityA.id,
      type: 'calls',
    });

    const result = findCircularDependencies(entityStore, relStore);

    expect(result.hasCycles).toBe(true);
    expect(result.cycles.length).toBeGreaterThanOrEqual(1);
    expect(result.summary.shortestCycle).toBe(2);
  });

  it('should NOT report self-referential cycles as false positives', () => {
    // Create an entity that references itself
    const entity = entityStore.create({
      type: 'class',
      name: 'User',
      filePath: '/app/models/user.rb',
      startLine: 1,
      endLine: 50,
      language: 'ruby',
    });

    // Create self-referential relationship (User -> User)
    // This happens when a class method calls itself or references the class name
    relStore.create({
      sourceId: entity.id,
      targetId: entity.id,
      type: 'calls',
    });

    const result = findCircularDependencies(entityStore, relStore);

    // Self-referential relationships should NOT be reported as cycles
    expect(result.hasCycles).toBe(false);
    expect(result.cycles.length).toBe(0);
    expect(result.summary.totalCycles).toBe(0);
  });

  it('should find cycles even when self-references exist', () => {
    const entityA = entityStore.create({
      type: 'class',
      name: 'ClassA',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB = entityStore.create({
      type: 'class',
      name: 'ClassB',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // Self-reference on A (should be ignored)
    relStore.create({
      sourceId: entityA.id,
      targetId: entityA.id,
      type: 'calls',
    });

    // A -> B
    relStore.create({
      sourceId: entityA.id,
      targetId: entityB.id,
      type: 'calls',
    });

    // B -> A (creates real cycle)
    relStore.create({
      sourceId: entityB.id,
      targetId: entityA.id,
      type: 'calls',
    });

    const result = findCircularDependencies(entityStore, relStore);

    // Should find the A -> B -> A cycle, but not report the self-reference
    expect(result.hasCycles).toBe(true);
    expect(result.cycles.length).toBe(1);
    expect(result.summary.shortestCycle).toBe(2); // A -> B -> A, not 1
  });

  it('should return empty result when no cycles exist', () => {
    const entityA = entityStore.create({
      type: 'function',
      name: 'funcA',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB = entityStore.create({
      type: 'function',
      name: 'funcB',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // A -> B (no cycle)
    relStore.create({
      sourceId: entityA.id,
      targetId: entityB.id,
      type: 'calls',
    });

    const result = findCircularDependencies(entityStore, relStore);

    expect(result.hasCycles).toBe(false);
    expect(result.cycles.length).toBe(0);
  });

  it('should find cycles involving extends relationships', () => {
    const entityA = entityStore.create({
      type: 'class',
      name: 'BaseClass',
      filePath: '/src/base.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB = entityStore.create({
      type: 'class',
      name: 'DerivedClass',
      filePath: '/src/derived.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // DerivedClass extends BaseClass
    relStore.create({
      sourceId: entityB.id,
      targetId: entityA.id,
      type: 'extends',
    });

    // BaseClass somehow depends on DerivedClass (bad design)
    relStore.create({
      sourceId: entityA.id,
      targetId: entityB.id,
      type: 'calls',
    });

    const result = findCircularDependencies(entityStore, relStore);

    expect(result.hasCycles).toBe(true);
    expect(result.cycles.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect maxCycles limit', () => {
    // Create 5 separate A -> B -> A style cycles
    for (let i = 0; i < 5; i++) {
      const entityA = entityStore.create({
        type: 'class',
        name: `ClassA${String(i)}`,
        filePath: `/src/a${String(i)}.ts`,
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const entityB = entityStore.create({
        type: 'class',
        name: `ClassB${String(i)}`,
        filePath: `/src/b${String(i)}.ts`,
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      relStore.create({
        sourceId: entityA.id,
        targetId: entityB.id,
        type: 'calls',
      });

      relStore.create({
        sourceId: entityB.id,
        targetId: entityA.id,
        type: 'calls',
      });
    }

    const result = findCircularDependencies(entityStore, relStore, undefined, 3);

    expect(result.cycles.length).toBeLessThanOrEqual(3);
  });

  it('should filter cycles by startEntityName', () => {
    const entityA = entityStore.create({
      type: 'class',
      name: 'TargetClass',
      filePath: '/src/target.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB = entityStore.create({
      type: 'class',
      name: 'OtherClass',
      filePath: '/src/other.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityC = entityStore.create({
      type: 'class',
      name: 'UnrelatedA',
      filePath: '/src/unrelated-a.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityD = entityStore.create({
      type: 'class',
      name: 'UnrelatedB',
      filePath: '/src/unrelated-b.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // Cycle involving TargetClass: A -> B -> A
    relStore.create({ sourceId: entityA.id, targetId: entityB.id, type: 'calls' });
    relStore.create({ sourceId: entityB.id, targetId: entityA.id, type: 'calls' });

    // Separate cycle not involving TargetClass: C -> D -> C
    relStore.create({ sourceId: entityC.id, targetId: entityD.id, type: 'calls' });
    relStore.create({ sourceId: entityD.id, targetId: entityC.id, type: 'calls' });

    const result = findCircularDependencies(entityStore, relStore, 'TargetClass');

    // Should only find cycles involving TargetClass
    expect(result.hasCycles).toBe(true);
    expect(result.cycles.every(c =>
      c.entities.some(e => e.name === 'TargetClass')
    )).toBe(true);
  });

  it('should deduplicate cycles with same entities but different IDs', () => {
    // Simulate duplicate entities (same name/path but different IDs)
    // This tests the defense-in-depth deduplication
    const entityA1 = entityStore.create({
      type: 'function',
      name: 'funcA',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB1 = entityStore.create({
      type: 'function',
      name: 'funcB',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // Create duplicate entities (simulating the bug from #192)
    const entityA2 = entityStore.create({
      type: 'function',
      name: 'funcA',
      filePath: '/src/a.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    const entityB2 = entityStore.create({
      type: 'function',
      name: 'funcB',
      filePath: '/src/b.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // Create cycle with first set of entities: A1 -> B1 -> A1
    relStore.create({ sourceId: entityA1.id, targetId: entityB1.id, type: 'calls' });
    relStore.create({ sourceId: entityB1.id, targetId: entityA1.id, type: 'calls' });

    // Create same logical cycle with duplicate entities: A2 -> B2 -> A2
    relStore.create({ sourceId: entityA2.id, targetId: entityB2.id, type: 'calls' });
    relStore.create({ sourceId: entityB2.id, targetId: entityA2.id, type: 'calls' });

    const result = findCircularDependencies(entityStore, relStore);

    // Should only report ONE cycle (funcA -> funcB -> funcA), not two
    // Even though they have different entity IDs, they represent the same logical cycle
    expect(result.hasCycles).toBe(true);
    expect(result.cycles.length).toBe(1);
    expect(result.summary.totalCycles).toBe(1);
  });
});
