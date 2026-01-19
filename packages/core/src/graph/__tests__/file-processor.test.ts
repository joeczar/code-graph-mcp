import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, resetDatabase } from '../../db/connection.js';
import { initializeSchema } from '../../db/schema.js';
import { FileProcessor } from '../file-processor.js';
import { createEntityStore } from '../../db/entities.js';
import { createRelationshipStore } from '../../db/relationships.js';
import type Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('FileProcessor', () => {
  let processor: FileProcessor;
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for each test
    db = getDatabase();
    initializeSchema(db);
    processor = new FileProcessor();
  });

  afterEach(() => {
    // Reset database singleton
    resetDatabase();
  });

  describe('TypeScript file processing', () => {
    it('processes TypeScript file successfully', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(filePath);
      expect(result.language).toBe('typescript');
      expect(result.fileHash).toBeDefined();
      expect(result.fileHash.length).toBe(64); // SHA-256 hex
    });

    it('extracts function entities from TypeScript', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const functions = result.entities.filter(e => e.type === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const greetFunc = functions.find(f => f.name === 'greet');
      expect(greetFunc).toBeDefined();
      expect(greetFunc?.filePath).toBe(filePath);
      expect(greetFunc?.language).toBe('typescript');
      expect(greetFunc?.startLine).toBeGreaterThan(0);
      expect(greetFunc?.endLine).toBeGreaterThanOrEqual(greetFunc?.startLine ?? 0);
    });

    it('extracts class entities from TypeScript', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const classes = result.entities.filter(e => e.type === 'class');
      expect(classes.length).toBeGreaterThanOrEqual(2);

      const calcClass = classes.find(c => c.name === 'Calculator');
      expect(calcClass).toBeDefined();
      expect(calcClass?.filePath).toBe(filePath);
      expect(calcClass?.language).toBe('typescript');
    });

    it('extracts method entities from TypeScript', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const methods = result.entities.filter(e => e.type === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const addMethod = methods.find(m => m.name === 'add');
      expect(addMethod).toBeDefined();
      expect(addMethod?.filePath).toBe(filePath);
    });

    it('extracts class inheritance relationships from TypeScript', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const extendsRels = result.relationships.filter(r => r.type === 'extends');
      expect(extendsRels.length).toBeGreaterThan(0);

      // AdvancedCalculator extends Calculator
      const inheritance = extendsRels.find(r => {
        const sourceEntity = result.entities.find(e => e.id === r.sourceId);
        const targetEntity = result.entities.find(e => e.id === r.targetId);
        return (
          sourceEntity?.name === 'AdvancedCalculator' &&
          targetEntity?.name === 'Calculator'
        );
      });
      expect(inheritance).toBeDefined();
    });

    it('stores entities in database', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const entityStore = createEntityStore(db);
      const storedEntities = entityStore.findByFile(filePath);

      expect(storedEntities.length).toBe(result.entities.length);
      expect(storedEntities.length).toBeGreaterThan(0);
    });

    it('stores relationships in database', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const relationshipStore = createRelationshipStore(db);
      const totalRelationships = relationshipStore.count();

      expect(totalRelationships).toBe(result.relationships.length);
    });
  });

  describe('Ruby file processing', () => {
    it('processes Ruby file successfully', async () => {
      const filePath = join(fixturesDir, 'sample.rb');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(filePath);
      expect(result.language).toBe('ruby');
      expect(result.fileHash).toBeDefined();
      expect(result.fileHash.length).toBe(64); // SHA-256 hex
    });

    it('extracts method entities from Ruby', async () => {
      const filePath = join(fixturesDir, 'sample.rb');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const functions = result.entities.filter(e => e.type === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const addFunc = functions.find(f => f.name === 'add');
      expect(addFunc).toBeDefined();
      expect(addFunc?.filePath).toBe(filePath);
      expect(addFunc?.language).toBe('ruby');
    });

    it('extracts class entities from Ruby', async () => {
      const filePath = join(fixturesDir, 'sample.rb');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const classes = result.entities.filter(e => e.type === 'class');
      expect(classes.length).toBeGreaterThanOrEqual(2);

      const calcClass = classes.find(c => c.name === 'Calculator');
      expect(calcClass).toBeDefined();
      expect(calcClass?.filePath).toBe(filePath);
      expect(calcClass?.language).toBe('ruby');
    });

    it('extracts module entities from Ruby', async () => {
      const filePath = join(fixturesDir, 'sample.rb');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const modules = result.entities.filter(e => e.type === 'module');
      expect(modules.length).toBeGreaterThan(0);

      const mathModule = modules.find(m => m.name === 'MathHelpers');
      expect(mathModule).toBeDefined();
      expect(mathModule?.filePath).toBe(filePath);
      expect(mathModule?.language).toBe('ruby');
    });

    it('extracts class inheritance relationships from Ruby', async () => {
      const filePath = join(fixturesDir, 'sample.rb');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const extendsRels = result.relationships.filter(r => r.type === 'extends');
      expect(extendsRels.length).toBeGreaterThan(0);

      // AdvancedCalculator extends Calculator
      const inheritance = extendsRels.find(r => {
        const sourceEntity = result.entities.find(e => e.id === r.sourceId);
        const targetEntity = result.entities.find(e => e.id === r.targetId);
        return (
          sourceEntity?.name === 'AdvancedCalculator' &&
          targetEntity?.name === 'Calculator'
        );
      });
      expect(inheritance).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('handles non-existent file gracefully', async () => {
      const filePath = join(fixturesDir, 'does-not-exist.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Failed to read file');
    });

    it('handles unsupported file type gracefully', async () => {
      const filePath = join(fixturesDir, 'sample.txt');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('detect language');
    });
  });

  describe('File hash calculation', () => {
    it('generates consistent hash for same file', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result1 = await processor.processFile({ filePath, db });
      const result2 = await processor.processFile({ filePath, db });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.fileHash).toBe(result2.fileHash);
    });
  });

  describe('Entity ID generation', () => {
    it('generates unique IDs for all entities', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const ids = new Set(result.entities.map(e => e.id));
      expect(ids.size).toBe(result.entities.length);
    });

    it('stores entity metadata timestamps', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      for (const entity of result.entities) {
        expect(entity.createdAt).toBeDefined();
        expect(entity.updatedAt).toBeDefined();
      }
    });
  });
});
