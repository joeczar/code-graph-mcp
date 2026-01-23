import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createEntityStore,
  createRelationshipStore,
} from '@code-graph/core';
import { whatCallsTool } from '../what-calls.js';

describe('whatCallsTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(whatCallsTool.metadata.name).toBe('what_calls');
      expect(whatCallsTool.metadata.description.toLowerCase()).toContain('call');
    });

    it('should require name parameter', () => {
      const parsed = whatCallsTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('should accept valid name parameter', () => {
      const parsed = whatCallsTool.metadata.inputSchema.safeParse({ name: 'test' });
      expect(parsed.success).toBe(true);
    });
  });

  describe('handler', () => {
    it('should return message when entity not found', async () => {
      const response = await whatCallsTool.handler({ name: 'nonexistent' });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No entities found');
      expect(text).toContain('nonexistent');
    });

    it('should return message when entity has no callers', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create an entity with no callers
      entityStore.create({
        type: 'function',
        name: 'targetFunc',
        filePath: '/test.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await whatCallsTool.handler({ name: 'targetFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No callers found');
      expect(text).toContain('targetFunc');
    });

    it('should find single caller', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create target entity
      const target = entityStore.create({
        type: 'function',
        name: 'targetFunc',
        filePath: '/target.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create caller entity
      const caller = entityStore.create({
        type: 'function',
        name: 'callerFunc',
        filePath: '/caller.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      // Create call relationship
      relationshipStore.create({
        sourceId: caller.id,
        targetId: target.id,
        type: 'calls',
      });

      const response = await whatCallsTool.handler({ name: 'targetFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain("Entities calling 'targetFunc'");
      expect(text).toContain('callerFunc');
      expect(text).toContain('function');
      expect(text).toContain('/caller.ts:10-20');
      expect(text).toContain('Total: 1 caller found');
    });

    it('should find multiple callers', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create target entity
      const target = entityStore.create({
        type: 'function',
        name: 'targetFunc',
        filePath: '/target.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create multiple caller entities
      const caller1 = entityStore.create({
        type: 'function',
        name: 'caller1',
        filePath: '/file1.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
      });

      const caller2 = entityStore.create({
        type: 'method',
        name: 'caller2',
        filePath: '/file2.ts',
        startLine: 20,
        endLine: 30,
        language: 'typescript',
      });

      // Create call relationships
      relationshipStore.create({
        sourceId: caller1.id,
        targetId: target.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: caller2.id,
        targetId: target.id,
        type: 'calls',
      });

      const response = await whatCallsTool.handler({ name: 'targetFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain("Entities calling 'targetFunc'");
      expect(text).toContain('caller1');
      expect(text).toContain('caller2');
      expect(text).toContain('/file1.ts:10-15');
      expect(text).toContain('/file2.ts:20-30');
      expect(text).toContain('Total: 2 callers found');
    });

    it('should only include calls relationships, not other types', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create target entity
      const target = entityStore.create({
        type: 'function',
        name: 'targetFunc',
        filePath: '/target.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create source entity
      const source = entityStore.create({
        type: 'function',
        name: 'sourceFunc',
        filePath: '/source.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      // Create non-call relationship (e.g., imports)
      relationshipStore.create({
        sourceId: source.id,
        targetId: target.id,
        type: 'imports',
      });

      const response = await whatCallsTool.handler({ name: 'targetFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Should not find the import relationship
      expect(text).toContain('No callers found');
    });

    it('should handle multiple entities with same name', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create two entities with same name but different files
      const target1 = entityStore.create({
        type: 'function',
        name: 'duplicate',
        filePath: '/file1.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const target2 = entityStore.create({
        type: 'function',
        name: 'duplicate',
        filePath: '/file2.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create callers for each
      const caller1 = entityStore.create({
        type: 'function',
        name: 'caller1',
        filePath: '/caller1.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
      });

      const caller2 = entityStore.create({
        type: 'function',
        name: 'caller2',
        filePath: '/caller2.ts',
        startLine: 20,
        endLine: 25,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: caller1.id,
        targetId: target1.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: caller2.id,
        targetId: target2.id,
        type: 'calls',
      });

      const response = await whatCallsTool.handler({ name: 'duplicate' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Should find both callers
      expect(text).toContain('caller1');
      expect(text).toContain('caller2');
      expect(text).toContain('Total: 2 callers found');
    });

    it('should deduplicate callers with identical logical identity', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create target entity
      const target = entityStore.create({
        type: 'function',
        name: 'targetFunc',
        filePath: '/target.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create a caller entity
      const caller = entityStore.create({
        type: 'function',
        name: 'callerFunc',
        filePath: '/caller.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      // Create a duplicate caller entity (same name, file, line - different ID)
      // This simulates what happens when a file is parsed multiple times
      const duplicateCaller = entityStore.create({
        type: 'function',
        name: 'callerFunc',
        filePath: '/caller.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      // Create call relationships from both (simulating duplicate relationships)
      relationshipStore.create({
        sourceId: caller.id,
        targetId: target.id,
        type: 'calls',
      });

      // This might fail due to unique constraint, but the test is about deduplication
      // of the entity results, not the relationship creation
      try {
        relationshipStore.create({
          sourceId: duplicateCaller.id,
          targetId: target.id,
          type: 'calls',
        });
      } catch {
        // Ignore if unique constraint fails - the duplicate entity still exists
      }

      const response = await whatCallsTool.handler({ name: 'targetFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Should deduplicate and show only one caller
      expect(text).toContain('callerFunc');
      expect(text).toContain('Total: 1 caller found');
    });
  });
});
