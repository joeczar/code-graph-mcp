import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase, initializeSchema } from '@code-graph/core';
import { createEntityStore } from '@code-graph/core';
import { graphStatusTool } from '../graph-status.js';

describe('graphStatusTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(graphStatusTool.metadata.name).toBe('graph_status');
      expect(graphStatusTool.metadata.description.toLowerCase()).toContain('graph');
    });

    it('should accept empty input', () => {
      const parsed = graphStatusTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });
  });

  describe('handler', () => {
    it('should return status for empty database', async () => {
      const response = await graphStatusTool.handler({});

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Knowledge Graph Status');
      expect(text).toContain('Total Entities: 0');
      expect(text).toContain('Total Relationships: 0');
      expect(text).toContain('(no entities)');
      expect(text).toContain('(no relationships)');
      expect(text).toContain('(no files parsed)');
    });

    it('should return status with entities', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create test entities
      entityStore.create({
        type: 'function',
        name: 'test1',
        filePath: '/test.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });
      entityStore.create({
        type: 'class',
        name: 'test2',
        filePath: '/test.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      });

      const response = await graphStatusTool.handler({});

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Total Entities: 2');
      expect(text).toContain('function: 1');
      expect(text).toContain('class: 1');
      expect(text).toContain('/test.ts');
      expect(text).toContain('Entities: 2');
    });

    it('should show database path', async () => {
      const response = await graphStatusTool.handler({});

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Database:');
    });

    it('should handle in-memory database', async () => {
      const response = await graphStatusTool.handler({});

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      // Check for either in-memory or file path
      expect(text).toMatch(/Database: (In-memory database|\/.*)/);
    });

    it('should show recently parsed files', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create entities in multiple files
      entityStore.create({
        type: 'function',
        name: 'fn1',
        filePath: '/src/file1.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });
      entityStore.create({
        type: 'function',
        name: 'fn2',
        filePath: '/src/file2.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await graphStatusTool.handler({});

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Recently Parsed Files');
      expect(text).toContain('/src/file1.ts');
      expect(text).toContain('/src/file2.ts');
      expect(text).toContain('Last Updated:');
    });
  });
});
