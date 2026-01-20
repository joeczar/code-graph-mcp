import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createEntityStore,
  createRelationshipStore,
} from '@code-graph/core';
import { blastRadiusTool } from '../blast-radius.js';

describe('blastRadiusTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(blastRadiusTool.metadata.name).toBe('blast_radius');
      expect(blastRadiusTool.metadata.description.toLowerCase()).toContain(
        'impact'
      );
    });

    it('should require filePath', () => {
      const parsed = blastRadiusTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('should accept valid input', () => {
      const parsed = blastRadiusTool.metadata.inputSchema.safeParse({
        filePath: '/test.ts',
      });
      expect(parsed.success).toBe(true);
    });

    it('should accept maxDepth parameter', () => {
      const parsed = blastRadiusTool.metadata.inputSchema.safeParse({
        filePath: '/test.ts',
        maxDepth: 3,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.maxDepth).toBe(3);
      }
    });

    it('should default maxDepth to 5', () => {
      const parsed = blastRadiusTool.metadata.inputSchema.safeParse({
        filePath: '/test.ts',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.maxDepth).toBe(5);
      }
    });
  });

  describe('handler', () => {
    it('should return message when file has no entities', async () => {
      const response = await blastRadiusTool.handler({
        filePath: '/nonexistent.ts',
        maxDepth: 5,
      });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Blast Radius Analysis');
      expect(text).toContain('/nonexistent.ts');
      expect(text).toContain('No entities found');
    });

    it('should show source entities with no dependents', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create an entity with no dependents
      entityStore.create({
        type: 'function',
        name: 'util',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const response = await blastRadiusTool.handler({
        filePath: '/utils.ts',
        maxDepth: 5,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Source Entities:');
      expect(text).toContain('util (function) [lines 1-10]');
      expect(text).toContain('No affected entities found');
    });

    it('should find direct dependents', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create source entity
      const source = entityStore.create({
        type: 'function',
        name: 'helper',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      // Create dependent entity
      const dependent = entityStore.create({
        type: 'function',
        name: 'process',
        filePath: '/main.ts',
        startLine: 5,
        endLine: 20,
        language: 'typescript',
      });

      // Create relationship (process calls helper)
      relationshipStore.create({
        sourceId: dependent.id,
        targetId: source.id,
        type: 'calls',
      });

      const response = await blastRadiusTool.handler({
        filePath: '/utils.ts',
        maxDepth: 5,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Source Entities:');
      expect(text).toContain('helper (function) [lines 1-10]');
      expect(text).toContain('Affected Entities');
      expect(text).toContain('Depth 1:');
      expect(text).toContain('process (function) in /main.ts:5-20');
      expect(text).toContain('Total affected: 1');
      expect(text).toContain('Direct dependents: 1');
    });

    it('should find transitive dependents', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create chain: utility <- helper <- process
      const utility = entityStore.create({
        type: 'function',
        name: 'utility',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const helper = entityStore.create({
        type: 'function',
        name: 'helper',
        filePath: '/helper.ts',
        startLine: 1,
        endLine: 15,
        language: 'typescript',
      });

      const process = entityStore.create({
        type: 'function',
        name: 'process',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      // helper calls utility
      relationshipStore.create({
        sourceId: helper.id,
        targetId: utility.id,
        type: 'calls',
      });

      // process calls helper
      relationshipStore.create({
        sourceId: process.id,
        targetId: helper.id,
        type: 'calls',
      });

      const response = await blastRadiusTool.handler({
        filePath: '/utils.ts',
        maxDepth: 5,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('utility (function) [lines 1-10]');
      expect(text).toContain('Depth 1:');
      expect(text).toContain('helper (function) in /helper.ts:1-15');
      expect(text).toContain('Depth 2:');
      expect(text).toContain('process (function) in /main.ts:1-20');
      expect(text).toContain('Total affected: 2');
      expect(text).toContain('Max depth reached: 2');
      expect(text).toContain('Direct dependents: 1');
    });

    it('should respect maxDepth parameter', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create long chain
      const e1 = entityStore.create({
        type: 'function',
        name: 'e1',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const e2 = entityStore.create({
        type: 'function',
        name: 'e2',
        filePath: '/file2.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const e3 = entityStore.create({
        type: 'function',
        name: 'e3',
        filePath: '/file3.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: e2.id,
        targetId: e1.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: e3.id,
        targetId: e2.id,
        type: 'calls',
      });

      // With maxDepth=1, should only find e2
      const response = await blastRadiusTool.handler({
        filePath: '/utils.ts',
        maxDepth: 1,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('e2 (function)');
      expect(text).not.toContain('e3 (function)');
      expect(text).toContain('Total affected: 1');
    });

    it('should handle multiple entities in source file', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create two entities in source file
      const util1 = entityStore.create({
        type: 'function',
        name: 'util1',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'util2',
        filePath: '/utils.ts',
        startLine: 12,
        endLine: 20,
        language: 'typescript',
      });

      // Create dependent on util1
      const dep1 = entityStore.create({
        type: 'function',
        name: 'dep1',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: dep1.id,
        targetId: util1.id,
        type: 'calls',
      });

      const response = await blastRadiusTool.handler({
        filePath: '/utils.ts',
        maxDepth: 5,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('util1 (function)');
      expect(text).toContain('util2 (function)');
      expect(text).toContain('dep1 (function)');
    });

    it('should avoid circular dependencies', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create circular dependency: a <- b <- c <- a
      const a = entityStore.create({
        type: 'function',
        name: 'a',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const b = entityStore.create({
        type: 'function',
        name: 'b',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const c = entityStore.create({
        type: 'function',
        name: 'c',
        filePath: '/c.ts',
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

      const response = await blastRadiusTool.handler({
        filePath: '/a.ts',
        maxDepth: 5,
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Should find b and c, but each only once despite the cycle
      expect(text).toContain('b (function)');
      expect(text).toContain('c (function)');
      expect(text).toContain('Total affected: 2');
    });
  });
});
