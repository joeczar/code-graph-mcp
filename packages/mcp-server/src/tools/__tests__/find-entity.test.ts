import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createEntityStore,
} from '@code-graph/core';
import { findEntityTool } from '../find-entity.js';

describe('findEntityTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(findEntityTool.metadata.name).toBe('find_entity');
      expect(findEntityTool.metadata.description.toLowerCase()).toContain(
        'search'
      );
    });

    it('should accept empty input', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });

    it('should accept namePattern', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({
        namePattern: 'test',
      });
      expect(parsed.success).toBe(true);
    });

    it('should accept valid matchMode', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({
        matchMode: 'exact',
      });
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid matchMode', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({
        matchMode: 'invalid',
      });
      expect(parsed.success).toBe(false);
    });

    it('should accept valid type', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({
        type: 'function',
      });
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid type', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({
        type: 'invalid',
      });
      expect(parsed.success).toBe(false);
    });

    it('should accept filePath', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({
        filePath: '/test.ts',
      });
      expect(parsed.success).toBe(true);
    });

    it('should default matchMode to contains', () => {
      const parsed = findEntityTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.matchMode).toBe('contains');
      }
    });
  });

  describe('handler', () => {
    it('should return no results for empty database', async () => {
      const response = await findEntityTool.handler({
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Entity Search Results');
      expect(text).toContain('No entities found');
    });

    it('should find entities by exact name match', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'processData',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'process',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        namePattern: 'process',
        matchMode: 'exact',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 1 entity:');
      expect(text).toContain('process (function)');
      expect(text).toContain('/main.ts:1-5');
      expect(text).not.toContain('processData');
    });

    it('should find entities by prefix match', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'processData',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'processFoo',
        filePath: '/helpers.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'handleProcess',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        namePattern: 'process',
        matchMode: 'prefix',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 2 entities:');
      expect(text).toContain('processData');
      expect(text).toContain('processFoo');
      expect(text).not.toContain('handleProcess');
    });

    it('should find entities by contains match', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'processData',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'handleProcess',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'render',
        filePath: '/view.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        namePattern: 'process',
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 2 entities:');
      expect(text).toContain('processData');
      expect(text).toContain('handleProcess');
      expect(text).not.toContain('render');
    });

    it('should filter by entity type', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'test',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'class',
        name: 'TestClass',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        type: 'function',
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 1 entity:');
      expect(text).toContain('test (function)');
      expect(text).not.toContain('TestClass');
    });

    it('should filter by file path', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'fn1',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'fn2',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        filePath: '/utils.ts',
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 1 entity:');
      expect(text).toContain('fn1 (function)');
      expect(text).toContain('/utils.ts:1-10');
      expect(text).not.toContain('fn2');
    });

    it('should combine name pattern and type filter', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'processData',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'class',
        name: 'ProcessHandler',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        namePattern: 'process',
        type: 'function',
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 1 entity:');
      expect(text).toContain('processData (function)');
      expect(text).not.toContain('ProcessHandler');
    });

    it('should handle case-insensitive matching', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'ProcessData',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        namePattern: 'processdata',
        matchMode: 'exact',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 1 entity:');
      expect(text).toContain('ProcessData');
    });

    it('should show query parameters in output', async () => {
      const response = await findEntityTool.handler({
        namePattern: 'test',
        type: 'function',
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Query:');
      expect(text).toContain('name contains "test"');
      expect(text).toContain('type: function');
    });

    it('should return all entities when no filters specified', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'fn1',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'class',
        name: 'Class1',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 20,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Found 2 entities:');
      expect(text).toContain('fn1 (function)');
      expect(text).toContain('Class1 (class)');
    });

    it('should number results', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'function',
        name: 'fn1',
        filePath: '/utils.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      });

      entityStore.create({
        type: 'function',
        name: 'fn2',
        filePath: '/main.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await findEntityTool.handler({
        matchMode: 'contains',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('1. fn');
      expect(text).toContain('2. fn');
    });
  });
});
