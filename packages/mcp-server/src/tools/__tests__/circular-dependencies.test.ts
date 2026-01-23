import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createEntityStore,
  createRelationshipStore,
} from '@code-graph/core';
import { circularDependenciesTool } from '../circular-dependencies.js';

describe('circularDependenciesTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(circularDependenciesTool.metadata.name).toBe(
        'circular_dependencies'
      );
      expect(
        circularDependenciesTool.metadata.description.toLowerCase()
      ).toContain('circular');
      expect(
        circularDependenciesTool.metadata.description.toLowerCase()
      ).toContain('cycle');
    });

    it('should accept empty input (finds all cycles)', () => {
      const parsed = circularDependenciesTool.metadata.inputSchema.safeParse(
        {}
      );
      expect(parsed.success).toBe(true);
    });

    it('should accept entityName parameter', () => {
      const parsed = circularDependenciesTool.metadata.inputSchema.safeParse({
        entityName: 'MyClass',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.entityName).toBe('MyClass');
      }
    });

    it('should accept maxCycles parameter', () => {
      const parsed = circularDependenciesTool.metadata.inputSchema.safeParse({
        maxCycles: 50,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.maxCycles).toBe(50);
      }
    });

    it('should default maxCycles to 100', () => {
      const parsed = circularDependenciesTool.metadata.inputSchema.safeParse(
        {}
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.maxCycles).toBe(100);
      }
    });
  });

  describe('handler', () => {
    it('should return message when no entities exist', async () => {
      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Circular Dependency Analysis');
      expect(text).toContain('No entities found in the graph');
    });

    it('should return message when specified entity not found', async () => {
      // Create some entities first so the graph isn't empty
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      entityStore.create({
        type: 'function',
        name: 'existingFunc',
        filePath: '/exists.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await circularDependenciesTool.handler({
        entityName: 'NonExistent',
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No entity found with name "NonExistent"');
    });

    it('should find no cycles when there are none', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create a simple chain: A -> B -> C (no cycle)
      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const c = entityStore.create({
        type: 'function',
        name: 'funcC',
        filePath: '/c.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      // A calls B, B calls C
      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: b.id,
        targetId: c.id,
        type: 'calls',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No circular dependencies found');
    });

    it('should detect a simple 2-entity cycle', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create A <-> B cycle
      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      // A calls B, B calls A
      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: b.id,
        targetId: a.id,
        type: 'calls',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 1 cycle');
      expect(text).toContain('funcA');
      expect(text).toContain('funcB');
      expect(text).toContain('[cycle complete]');
      expect(text).toContain('Shortest cycle: 2 entities');
    });

    it('should detect a 3-entity cycle', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create A -> B -> C -> A cycle
      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const c = entityStore.create({
        type: 'function',
        name: 'funcC',
        filePath: '/c.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: b.id,
        targetId: c.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: c.id,
        targetId: a.id,
        type: 'calls',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 1 cycle');
      expect(text).toContain('funcA');
      expect(text).toContain('funcB');
      expect(text).toContain('funcC');
      expect(text).toContain('Shortest cycle: 3 entities');
    });

    it('should detect cycles with different relationship types', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create cycle with imports
      const moduleA = entityStore.create({
        type: 'module',
        name: 'moduleA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 50,
        language: 'typescript',
      });

      const moduleB = entityStore.create({
        type: 'module',
        name: 'moduleB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 50,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: moduleA.id,
        targetId: moduleB.id,
        type: 'imports',
      });

      relationshipStore.create({
        sourceId: moduleB.id,
        targetId: moduleA.id,
        type: 'imports',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 1 cycle');
      expect(text).toContain('[imports]');
    });

    it('should detect cycles with extends relationship', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create cycle with extends (artificial, but tests the relationship type)
      const classA = entityStore.create({
        type: 'class',
        name: 'ClassA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      const classB = entityStore.create({
        type: 'class',
        name: 'ClassB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      // This is artificial but tests the cycle detection
      relationshipStore.create({
        sourceId: classA.id,
        targetId: classB.id,
        type: 'extends',
      });

      relationshipStore.create({
        sourceId: classB.id,
        targetId: classA.id,
        type: 'extends',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 1 cycle');
      expect(text).toContain('[extends]');
    });

    it('should filter cycles by entity name when specified', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create two separate cycles: A <-> B and C <-> D
      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const c = entityStore.create({
        type: 'function',
        name: 'funcC',
        filePath: '/c.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const d = entityStore.create({
        type: 'function',
        name: 'funcD',
        filePath: '/d.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      // Cycle 1: A <-> B
      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: b.id,
        targetId: a.id,
        type: 'calls',
      });

      // Cycle 2: C <-> D
      relationshipStore.create({
        sourceId: c.id,
        targetId: d.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: d.id,
        targetId: c.id,
        type: 'calls',
      });

      // Search for cycles involving funcA only
      const response = await circularDependenciesTool.handler({
        entityName: 'funcA',
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 1 cycle');
      expect(text).toContain('funcA');
      expect(text).toContain('funcB');
      // Should NOT contain the other cycle
      expect(text).not.toContain('funcC');
      expect(text).not.toContain('funcD');
    });

    it('should respect maxCycles limit', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create multiple simple cycles
      for (let i = 0; i < 5; i++) {
        const a = entityStore.create({
          type: 'function',
          name: `pair${i.toString()}A`,
          filePath: `/pair${i.toString()}/a.ts`,
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        });

        const b = entityStore.create({
          type: 'function',
          name: `pair${i.toString()}B`,
          filePath: `/pair${i.toString()}/b.ts`,
          startLine: 1,
          endLine: 10,
          language: 'typescript',
        });

        relationshipStore.create({
          sourceId: a.id,
          targetId: b.id,
          type: 'calls',
        });
        relationshipStore.create({
          sourceId: b.id,
          targetId: a.id,
          type: 'calls',
        });
      }

      // Request only 2 cycles
      const response = await circularDependenciesTool.handler({
        maxCycles: 2,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 2 cycle');
      expect(text).toContain('Limited to 2 cycles');
    });

    it('should not count contains relationships as dependencies', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create entities with contains relationship (structural, not a dependency)
      const classA = entityStore.create({
        type: 'class',
        name: 'ClassA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 50,
        language: 'typescript',
      });

      const methodA = entityStore.create({
        type: 'method',
        name: 'methodA',
        filePath: '/a.ts',
        startLine: 5,
        endLine: 15,
        language: 'typescript',
      });

      // Contains is structural, not a dependency - should not create a cycle
      relationshipStore.create({
        sourceId: classA.id,
        targetId: methodA.id,
        type: 'contains',
      });

      relationshipStore.create({
        sourceId: methodA.id,
        targetId: classA.id,
        type: 'contains',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No circular dependencies found');
    });

    it('should report correct statistics for multiple cycles', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create a short cycle (2 entities) and a longer cycle (3 entities)
      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      // Short cycle: A <-> B
      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: b.id,
        targetId: a.id,
        type: 'calls',
      });

      // Create separate 3-entity cycle: C -> D -> E -> C
      const c = entityStore.create({
        type: 'function',
        name: 'funcC',
        filePath: '/c.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const d = entityStore.create({
        type: 'function',
        name: 'funcD',
        filePath: '/d.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const e = entityStore.create({
        type: 'function',
        name: 'funcE',
        filePath: '/e.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: c.id,
        targetId: d.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: d.id,
        targetId: e.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: e.id,
        targetId: c.id,
        type: 'calls',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Found 2 cycle');
      expect(text).toContain('Shortest cycle: 2 entities');
      expect(text).toContain('Longest cycle: 3 entities');
      expect(text).toContain('Entities involved: 5');
    });

    it('should not report duplicate cycles', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create a simple A <-> B cycle
      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: b.id,
        targetId: a.id,
        type: 'calls',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      // Should find exactly 1 cycle, not 2 (A->B->A is same as B->A->B)
      expect(text).toContain('Found 1 cycle');
      expect(text).toContain('Total cycles: 1');
    });

    it('should include file and line information in output', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      const a = entityStore.create({
        type: 'function',
        name: 'funcA',
        filePath: '/src/a.ts',
        startLine: 42,
        endLine: 50,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'funcB',
        filePath: '/src/b.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: a.id,
        targetId: b.id,
        type: 'calls',
      });
      relationshipStore.create({
        sourceId: b.id,
        targetId: a.id,
        type: 'calls',
      });

      const response = await circularDependenciesTool.handler({
        maxCycles: 100,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('/src/a.ts:42');
      expect(text).toContain('/src/b.ts:10');
    });
  });
});
