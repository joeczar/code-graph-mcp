import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createEntityStore,
  createRelationshipStore,
} from '@code-graph/core';
import { whatDoesCallTool } from '../what-does-call.js';

describe('whatDoesCallTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(whatDoesCallTool.metadata.name).toBe('what_does_call');
      expect(whatDoesCallTool.metadata.description.toLowerCase()).toContain('call');
    });

    it('should require name parameter', () => {
      const parsed = whatDoesCallTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('should accept valid name parameter', () => {
      const parsed = whatDoesCallTool.metadata.inputSchema.safeParse({ name: 'test' });
      expect(parsed.success).toBe(true);
    });
  });

  describe('handler', () => {
    it('should return message when entity not found', async () => {
      const response = await whatDoesCallTool.handler({ name: 'nonexistent' });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No entities found');
      expect(text).toContain('nonexistent');
    });

    it('should return message when entity calls nothing', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create an entity that doesn't call anything
      entityStore.create({
        type: 'function',
        name: 'sourceFunc',
        filePath: '/test.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await whatDoesCallTool.handler({ name: 'sourceFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('No callees found');
      expect(text).toContain('sourceFunc');
    });

    it('should find single callee', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create source entity
      const source = entityStore.create({
        type: 'function',
        name: 'sourceFunc',
        filePath: '/source.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create callee entity
      const callee = entityStore.create({
        type: 'function',
        name: 'calleeFunc',
        filePath: '/callee.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      // Create call relationship
      relationshipStore.create({
        sourceId: source.id,
        targetId: callee.id,
        type: 'calls',
      });

      const response = await whatDoesCallTool.handler({ name: 'sourceFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain("Entities called by 'sourceFunc'");
      expect(text).toContain('calleeFunc');
      expect(text).toContain('function');
      expect(text).toContain('/callee.ts:10-20');
      expect(text).toContain('Total: 1 callee found');
    });

    it('should find multiple callees', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create source entity
      const source = entityStore.create({
        type: 'function',
        name: 'sourceFunc',
        filePath: '/source.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create multiple callee entities
      const callee1 = entityStore.create({
        type: 'function',
        name: 'callee1',
        filePath: '/file1.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
      });

      const callee2 = entityStore.create({
        type: 'method',
        name: 'callee2',
        filePath: '/file2.ts',
        startLine: 20,
        endLine: 30,
        language: 'typescript',
      });

      // Create call relationships
      relationshipStore.create({
        sourceId: source.id,
        targetId: callee1.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: source.id,
        targetId: callee2.id,
        type: 'calls',
      });

      const response = await whatDoesCallTool.handler({ name: 'sourceFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain("Entities called by 'sourceFunc'");
      expect(text).toContain('callee1');
      expect(text).toContain('callee2');
      expect(text).toContain('/file1.ts:10-15');
      expect(text).toContain('/file2.ts:20-30');
      expect(text).toContain('Total: 2 callees found');
    });

    it('should only include calls relationships, not other types', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create source entity
      const source = entityStore.create({
        type: 'function',
        name: 'sourceFunc',
        filePath: '/source.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create target entity
      const target = entityStore.create({
        type: 'function',
        name: 'targetFunc',
        filePath: '/target.ts',
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

      const response = await whatDoesCallTool.handler({ name: 'sourceFunc' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Should not find the import relationship
      expect(text).toContain('No callees found');
    });

    it('should handle multiple entities with same name', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      // Create two entities with same name but different files
      const source1 = entityStore.create({
        type: 'function',
        name: 'duplicate',
        filePath: '/file1.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const source2 = entityStore.create({
        type: 'function',
        name: 'duplicate',
        filePath: '/file2.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Create callees for each
      const callee1 = entityStore.create({
        type: 'function',
        name: 'callee1',
        filePath: '/callee1.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
      });

      const callee2 = entityStore.create({
        type: 'function',
        name: 'callee2',
        filePath: '/callee2.ts',
        startLine: 20,
        endLine: 25,
        language: 'typescript',
      });

      relationshipStore.create({
        sourceId: source1.id,
        targetId: callee1.id,
        type: 'calls',
      });

      relationshipStore.create({
        sourceId: source2.id,
        targetId: callee2.id,
        type: 'calls',
      });

      const response = await whatDoesCallTool.handler({ name: 'duplicate' });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Should find both callees
      expect(text).toContain('callee1');
      expect(text).toContain('callee2');
      expect(text).toContain('Total: 2 callees found');
    });
  });
});
