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

      const methods = result.entities.filter(e => e.type === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const addMethod = methods.find(f => f.name === 'add');
      expect(addMethod).toBeDefined();
      expect(addMethod?.filePath).toBe(filePath);
      expect(addMethod?.language).toBe('ruby');
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
      expect(result.error).toContain('not found');
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

  describe('File entity and contains relationships', () => {
    it('creates File entity with correct properties', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const fileEntities = result.entities.filter(e => e.type === 'file');
      expect(fileEntities.length).toBe(1);

      const fileEntity = fileEntities[0];
      expect(fileEntity.name).toBe(filePath);
      expect(fileEntity.filePath).toBe(filePath);
      expect(fileEntity.startLine).toBe(1);
      expect(fileEntity.endLine).toBeGreaterThan(0);
      expect(fileEntity.language).toBe('typescript');
      expect(fileEntity.metadata).toBeDefined();
      expect(fileEntity.metadata?.contentHash).toBe(result.fileHash);
    });

    it('creates contains relationships from File to all code entities', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const fileEntity = result.entities.find(e => e.type === 'file');
      expect(fileEntity).toBeDefined();

      const codeEntities = result.entities.filter(e => e.type !== 'file');
      expect(codeEntities.length).toBeGreaterThan(0);

      const containsRels = result.relationships.filter(r => r.type === 'contains');
      expect(containsRels.length).toBe(codeEntities.length);

      // Verify each contains relationship has File as source and a code entity as target
      for (const rel of containsRels) {
        expect(rel.sourceId).toBe(fileEntity?.id);
        const targetEntity = result.entities.find(e => e.id === rel.targetId);
        expect(targetEntity).toBeDefined();
        expect(targetEntity?.type).not.toBe('file');
      }
    });

    it('File entity is stored in database', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const entityStore = createEntityStore(db);
      const fileEntities = entityStore.findByType('file');

      expect(fileEntities.length).toBe(1);
      expect(fileEntities[0].filePath).toBe(filePath);
    });

    it('contains relationships are stored in database', async () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(true);

      const relationshipStore = createRelationshipStore(db);
      const containsRels = relationshipStore.findByType('contains');

      const codeEntitiesCount = result.entities.filter(e => e.type !== 'file').length;
      expect(containsRels.length).toBe(codeEntitiesCount);
    });
  });

  describe('Transaction rollback', () => {
    it('returns error and empty results if transaction fails', async () => {
      const filePath = join(fixturesDir, 'sample.ts');

      // Create a constraint that will be violated during entity insertion
      // Add a UNIQUE constraint on (name, file_path) combination
      db.exec('CREATE UNIQUE INDEX idx_unique_name_file ON entities(name, file_path)');

      // First insert should succeed
      const result1 = await processor.processFile({ filePath, db });
      expect(result1.success).toBe(true);
      expect(result1.entities.length).toBeGreaterThan(0);

      const initialEntityCount = result1.entities.length;
      const initialRelationshipCount = result1.relationships.length;

      // Second insert of same file should fail due to UNIQUE constraint
      const result2 = await processor.processFile({ filePath, db });

      expect(result2.success).toBe(false);
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain('Database transaction failed');
      expect(result2.entities).toEqual([]);
      expect(result2.relationships).toEqual([]);

      // Verify database still contains only the first set of data (no partial writes)
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      const storedEntities = entityStore.findByFile(filePath);
      const totalRelationships = relationshipStore.count();

      // Should still have exactly the original count, not double
      expect(storedEntities.length).toBe(initialEntityCount);
      expect(totalRelationships).toBe(initialRelationshipCount);
    });

    it('does not write partial data if relationship creation fails', async () => {
      const filePath = join(fixturesDir, 'sample.ts');

      // Add a foreign key constraint that will fail
      // (Note: SQLite foreign keys are already enabled in our schema)
      // We can test by manually inserting an entity, then trying to process
      // a file that references a non-existent entity in a relationship

      // First, verify initial state is empty
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      const initialEntities = entityStore.findByFile(filePath);
      const initialRelationships = relationshipStore.count();

      expect(initialEntities.length).toBe(0);
      expect(initialRelationships).toBe(0);

      // Now simulate a transaction failure by dropping relationships table
      // after entities are created but before relationships are stored
      // This is tricky to test without modifying the code, so instead we'll
      // verify that the transaction wrapper catches errors properly

      // Use a database that will fail on the relationship insert
      // by adding a CHECK constraint that always fails
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS fail_relationship_insert
        BEFORE INSERT ON relationships
        BEGIN
          SELECT RAISE(ABORT, 'Simulated transaction failure');
        END
      `);

      const result = await processor.processFile({ filePath, db });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Database transaction failed');
      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);

      // Verify NO entities were written (transaction rolled back completely)
      const storedEntities = entityStore.findByFile(filePath);
      const totalRelationships = relationshipStore.count();

      expect(storedEntities.length).toBe(0);
      expect(totalRelationships).toBe(0);
    });
  });
});
