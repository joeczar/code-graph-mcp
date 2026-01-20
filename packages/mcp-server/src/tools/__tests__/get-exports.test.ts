import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase, initializeSchema } from '@code-graph/core';
import { createEntityStore } from '@code-graph/core';
import { getExportsTool } from '../get-exports.js';

describe('getExportsTool', () => {
  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(getExportsTool.metadata.name).toBe('get_exports');
      expect(getExportsTool.metadata.description.toLowerCase()).toContain('export');
    });

    it('should require filePath parameter', () => {
      const parsed = getExportsTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('should accept valid filePath', () => {
      const parsed = getExportsTool.metadata.inputSchema.safeParse({
        filePath: '/src/test.ts',
      });
      expect(parsed.success).toBe(true);
    });

    it('should reject empty filePath', () => {
      const parsed = getExportsTool.metadata.inputSchema.safeParse({
        filePath: '',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('handler', () => {
    it('should return no exports for empty file', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create entity without isExported metadata
      entityStore.create({
        type: 'function',
        name: 'privateFunction',
        filePath: '/src/utils.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      const response = await getExportsTool.handler({
        filePath: '/src/utils.ts',
      });

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0]?.type).toBe('text');

      const text = response.content[0]?.text ?? '';
      expect(text).toContain('=== Exports from /src/utils.ts ===');
      expect(text).toContain('(no exports)');
    });

    it('should list named exports only', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Create exported function
      entityStore.create({
        type: 'function',
        name: 'greet',
        filePath: '/src/utils.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
        metadata: {
          isExported: true,
          exportType: 'named',
          signature: '(name: string) => string',
        },
      });

      // Create exported class
      entityStore.create({
        type: 'class',
        name: 'Helper',
        filePath: '/src/utils.ts',
        startLine: 20,
        endLine: 30,
        language: 'typescript',
        metadata: {
          isExported: true,
          exportType: 'named',
        },
      });

      const response = await getExportsTool.handler({
        filePath: '/src/utils.ts',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Total Exports: 2');
      expect(text).toContain('[named] function greet');
      expect(text).toContain('Lines: 10-15');
      expect(text).toContain('Signature: (name: string) => string');
      expect(text).toContain('[named] class Helper');
      expect(text).toContain('Lines: 20-30');
    });

    it('should list default export', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'class',
        name: 'Calculator',
        filePath: '/src/calc.ts',
        startLine: 5,
        endLine: 50,
        language: 'typescript',
        metadata: {
          isExported: true,
          exportType: 'default',
          signature: 'class Calculator { add(a: number, b: number): number }',
        },
      });

      const response = await getExportsTool.handler({
        filePath: '/src/calc.ts',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Total Exports: 1');
      expect(text).toContain('[default] class Calculator');
      expect(text).toContain('Lines: 5-50');
      expect(text).toContain('Signature: class Calculator');
    });

    it('should list mixed exports (default + named)', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Default export
      entityStore.create({
        type: 'class',
        name: 'MainApp',
        filePath: '/src/app.ts',
        startLine: 1,
        endLine: 100,
        language: 'typescript',
        metadata: {
          isExported: true,
          exportType: 'default',
        },
      });

      // Named exports
      entityStore.create({
        type: 'function',
        name: 'initConfig',
        filePath: '/src/app.ts',
        startLine: 102,
        endLine: 110,
        language: 'typescript',
        metadata: {
          isExported: true,
          exportType: 'named',
        },
      });

      entityStore.create({
        type: 'type',
        name: 'VERSION',
        filePath: '/src/app.ts',
        startLine: 112,
        endLine: 112,
        language: 'typescript',
        metadata: {
          isExported: true,
          exportType: 'named',
        },
      });

      const response = await getExportsTool.handler({
        filePath: '/src/app.ts',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Total Exports: 3');
      expect(text).toContain('[default] class MainApp');
      expect(text).toContain('[named] function initConfig');
      expect(text).toContain('[named] type VERSION');
    });

    it('should handle exports without signatures', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      entityStore.create({
        type: 'type',
        name: 'User',
        filePath: '/src/types.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
        metadata: {
          isExported: true,
        },
      });

      const response = await getExportsTool.handler({
        filePath: '/src/types.ts',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('[named] type User');
      expect(text).toContain('Lines: 1-5');
      expect(text).not.toContain('Signature:');
    });

    it('should return no exports for non-existent file', async () => {
      const response = await getExportsTool.handler({
        filePath: '/non/existent/file.ts',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('=== Exports from /non/existent/file.ts ===');
      expect(text).toContain('(no exports)');
    });

    it('should filter out non-exported entities', async () => {
      const db = getDatabase();
      const entityStore = createEntityStore(db);

      // Private function (no isExported metadata)
      entityStore.create({
        type: 'function',
        name: 'privateHelper',
        filePath: '/src/utils.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      });

      // Exported function
      entityStore.create({
        type: 'function',
        name: 'publicHelper',
        filePath: '/src/utils.ts',
        startLine: 10,
        endLine: 15,
        language: 'typescript',
        metadata: {
          isExported: true,
        },
      });

      // Another private function (isExported: false)
      entityStore.create({
        type: 'function',
        name: 'anotherPrivate',
        filePath: '/src/utils.ts',
        startLine: 20,
        endLine: 25,
        language: 'typescript',
        metadata: {
          isExported: false,
        },
      });

      const response = await getExportsTool.handler({
        filePath: '/src/utils.ts',
      });

      expect(response.isError).toBeUndefined();
      const text = response.content[0]?.text ?? '';

      expect(text).toContain('Total Exports: 1');
      expect(text).toContain('publicHelper');
      expect(text).not.toContain('privateHelper');
      expect(text).not.toContain('anotherPrivate');
    });
  });
});
