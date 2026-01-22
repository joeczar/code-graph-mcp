import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase } from '../../db/connection.js';
import { initializeSchema } from '../../db/schema.js';
import {
  createEntityStore,
  type EntityStore,
  type NewEntity,
} from '../../db/entities.js';
import { getExports } from '../getExports.js';

describe('getExports', () => {
  let store: EntityStore;

  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
    store = createEntityStore(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  const baseEntity: NewEntity = {
    type: 'function',
    name: 'greet',
    filePath: '/src/utils.ts',
    startLine: 10,
    endLine: 15,
    language: 'typescript',
  };

  describe('file with no exports', () => {
    it('returns empty exports array for file with no exported entities', () => {
      // Create entities without exported metadata
      store.create(baseEntity);
      store.create({ ...baseEntity, name: 'helper', startLine: 20, endLine: 25 });

      const result = getExports('/src/utils.ts', store);

      expect(result.filePath).toBe('/src/utils.ts');
      expect(result.exports).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('returns empty result for non-existent file', () => {
      const result = getExports('/src/nonexistent.ts', store);

      expect(result.filePath).toBe('/src/nonexistent.ts');
      expect(result.exports).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('file with named exports only', () => {
    it('returns all named exports from file', () => {
      store.create({
        ...baseEntity,
        name: 'greet',
        metadata: { exported: true, exportType: 'named' },
      });
      store.create({
        ...baseEntity,
        name: 'helper',
        startLine: 20,
        endLine: 25,
        metadata: { exported: true, exportType: 'named' },
      });
      // Non-exported entity
      store.create({
        ...baseEntity,
        name: 'internal',
        startLine: 30,
        endLine: 35,
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(2);
      expect(result.totalCount).toBe(2);

      const greetExport = result.exports.find(e => e.entity.name === 'greet');
      expect(greetExport).toBeDefined();
      expect(greetExport?.exportType).toBe('named');
      expect(greetExport?.signature).toBeUndefined();

      const helperExport = result.exports.find(e => e.entity.name === 'helper');
      expect(helperExport).toBeDefined();
      expect(helperExport?.exportType).toBe('named');
    });

    it('includes signature when present in metadata', () => {
      store.create({
        ...baseEntity,
        name: 'greet',
        metadata: {
          exported: true,
          exportType: 'named',
          signature: '(name: string) => string',
        },
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0]?.signature).toBe('(name: string) => string');
    });
  });

  describe('file with default export', () => {
    it('identifies default export correctly', () => {
      store.create({
        ...baseEntity,
        name: 'Calculator',
        type: 'class',
        metadata: { exported: true, exportType: 'default' },
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0]?.exportType).toBe('default');
      expect(result.exports[0]?.entity.name).toBe('Calculator');
    });

    it('handles default export with signature', () => {
      store.create({
        ...baseEntity,
        name: 'default',
        metadata: {
          exported: true,
          exportType: 'default',
          signature: '(config: Config) => App',
        },
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0]?.exportType).toBe('default');
      expect(result.exports[0]?.signature).toBe('(config: Config) => App');
    });
  });

  describe('file with mixed exports', () => {
    it('returns both default and named exports', () => {
      // Default export
      store.create({
        ...baseEntity,
        name: 'Calculator',
        type: 'class',
        metadata: { exported: true, exportType: 'default' },
      });

      // Named exports
      store.create({
        ...baseEntity,
        name: 'add',
        startLine: 20,
        endLine: 22,
        metadata: { exported: true, exportType: 'named' },
      });
      store.create({
        ...baseEntity,
        name: 'subtract',
        startLine: 24,
        endLine: 26,
        metadata: { exported: true, exportType: 'named' },
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(3);
      expect(result.totalCount).toBe(3);

      const defaultExport = result.exports.find(
        e => e.exportType === 'default'
      );
      expect(defaultExport?.entity.name).toBe('Calculator');

      const namedExports = result.exports.filter(
        e => e.exportType === 'named'
      );
      expect(namedExports).toHaveLength(2);
    });
  });

  describe('entity without exported metadata', () => {
    it('does not include entities with exported = false', () => {
      store.create({
        ...baseEntity,
        metadata: { exported: false },
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(0);
    });

    it('does not include entities without metadata', () => {
      store.create(baseEntity);

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(0);
    });

    it('defaults exportType to "named" when not specified', () => {
      store.create({
        ...baseEntity,
        metadata: { exported: true },
      });

      const result = getExports('/src/utils.ts', store);

      expect(result.exports).toHaveLength(1);
      expect(result.exports[0]?.exportType).toBe('named');
    });
  });

  describe('multiple files', () => {
    it('only returns exports from the specified file', () => {
      // File 1
      store.create({
        ...baseEntity,
        filePath: '/src/utils.ts',
        name: 'greet',
        metadata: { exported: true },
      });

      // File 2
      store.create({
        ...baseEntity,
        filePath: '/src/helpers.ts',
        name: 'helper',
        metadata: { exported: true },
      });

      const result1 = getExports('/src/utils.ts', store);
      const result2 = getExports('/src/helpers.ts', store);

      expect(result1.exports).toHaveLength(1);
      expect(result1.exports[0]?.entity.name).toBe('greet');

      expect(result2.exports).toHaveLength(1);
      expect(result2.exports[0]?.entity.name).toBe('helper');
    });
  });
});
