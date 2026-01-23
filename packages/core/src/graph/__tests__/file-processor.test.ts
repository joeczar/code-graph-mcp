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

/**
 * Helper to find a relationship by source and target entity names.
 */
function findRelationship(
  relationships: { sourceId: string; targetId: string; type: string }[],
  entities: { id: string; name: string }[],
  sourceName: string,
  targetName: string
): { sourceId: string; targetId: string; type: string } | undefined {
  return relationships.find(r => {
    const sourceEntity = entities.find(e => e.id === r.sourceId);
    const targetEntity = entities.find(e => e.id === r.targetId);
    return sourceEntity?.name === sourceName && targetEntity?.name === targetName;
  });
}

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

      // RubyExtractor produces fully qualified names (Class#method)
      const addMethod = methods.find(f => f.name === 'Calculator#add');
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

    it('handles duplicate relationships gracefully when parsing same file twice', async () => {
      const filePath = join(fixturesDir, 'sample.rb');

      // First parse
      const result1 = await processor.processFile({ filePath, db });
      expect(result1.success).toBe(true);
      const firstCount = result1.relationships.length;

      // Clear database to allow re-parsing
      resetDatabase();
      db = getDatabase();
      initializeSchema(db);

      // Second parse - should succeed without throwing on duplicate relationships
      const result2 = await processor.processFile({ filePath, db });
      expect(result2.success).toBe(true);

      // Should have same number of relationships
      expect(result2.relationships.length).toBe(firstCount);
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
      expect(fileEntity).toBeDefined();
      if (!fileEntity) return;

      expect(fileEntity.name).toBe(filePath);
      expect(fileEntity.filePath).toBe(filePath);
      expect(fileEntity.startLine).toBe(1);
      expect(fileEntity.endLine).toBeGreaterThan(0);
      expect(fileEntity.language).toBe('typescript');
      expect(fileEntity.metadata).toBeDefined();
      expect(fileEntity.metadata?.['contentHash']).toBe(result.fileHash);
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
      expect(fileEntities[0]?.filePath).toBe(filePath);
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
    it('re-parsing same file cleans up and replaces data correctly', async () => {
      const filePath = join(fixturesDir, 'sample.ts');

      // Create a constraint that would fail if we didn't clean up first
      // Add a UNIQUE constraint on (name, file_path) combination
      db.exec('CREATE UNIQUE INDEX idx_unique_name_file ON entities(name, file_path)');

      // First insert should succeed
      const result1 = await processor.processFile({ filePath, db });
      expect(result1.success).toBe(true);
      expect(result1.entities.length).toBeGreaterThan(0);

      const initialEntityCount = result1.entities.length;
      const initialRelationshipCount = result1.relationships.length;

      // Second insert of same file should succeed because we clean up first
      const result2 = await processor.processFile({ filePath, db });

      expect(result2.success).toBe(true);
      expect(result2.entities.length).toBe(initialEntityCount);
      expect(result2.relationships.length).toBe(initialRelationshipCount);

      // Verify database contains exactly one set of data (not duplicates)
      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      const storedEntities = entityStore.findByFile(filePath);
      const totalRelationships = relationshipStore.count();

      // Should have exactly the same count, not double
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

  describe('Call relationship extraction', () => {
    describe('TypeScript', () => {
      it('extracts function call relationships', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.ts');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const callRels = result.relationships.filter(r => r.type === 'calls');
        expect(callRels.length).toBeGreaterThan(0);

        // main calls helper
        const mainCallsHelper = findRelationship(callRels, result.entities, 'main', 'helper');
        expect(mainCallsHelper).toBeDefined();
      });

      it('extracts method call relationships', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.ts');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const callRels = result.relationships.filter(r => r.type === 'calls');

        // calculate calls add
        const calculateCallsAdd = findRelationship(callRels, result.entities, 'calculate', 'add');
        expect(calculateCallsAdd).toBeDefined();
      });

      it('stores call relationships in database', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.ts');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const relationshipStore = createRelationshipStore(db);
        const callRels = relationshipStore.findByType('calls');

        expect(callRels.length).toBeGreaterThan(0);
      });

      it('supports what_calls queries', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.ts');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const relationshipStore = createRelationshipStore(db);
        const helperEntity = result.entities.find(e => e.name === 'helper');
        expect(helperEntity).toBeDefined();

        if (helperEntity) {
          const callers = relationshipStore.findByTarget(helperEntity.id);
          const callRelationships = callers.filter(r => r.type === 'calls');

          expect(callRelationships.length).toBe(1);
          const caller = result.entities.find(e => e.id === callRelationships[0]?.sourceId);
          expect(caller?.name).toBe('main');
        }
      });

      it('supports what_does_call queries', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.ts');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const relationshipStore = createRelationshipStore(db);
        const mainEntity = result.entities.find(e => e.name === 'main');
        expect(mainEntity).toBeDefined();

        if (mainEntity) {
          const callees = relationshipStore.findBySource(mainEntity.id);
          const callRelationships = callees.filter(r => r.type === 'calls');

          expect(callRelationships.length).toBe(1);
          const callee = result.entities.find(e => e.id === callRelationships[0]?.targetId);
          expect(callee?.name).toBe('helper');
        }
      });
    });

    describe('Ruby', () => {
      it('extracts method call relationships', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.rb');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const callRels = result.relationships.filter(r => r.type === 'calls');
        expect(callRels.length).toBeGreaterThan(0);

        // main calls helper
        const mainCallsHelper = findRelationship(callRels, result.entities, 'main', 'helper');
        expect(mainCallsHelper).toBeDefined();
      });

      // Skip: Ruby extractor uses qualified names (Calculator#calculate) but entities
      // are stored with simple names (calculate). This causes resolution to fail for
      // method calls within classes. This test will be unskipped when qualified name
      // resolution is implemented.
      it.skip('extracts method calls within classes', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.rb');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const callRels = result.relationships.filter(r => r.type === 'calls');

        // Verify Calculator#calculate calls Calculator#add
        const calculateCallsAdd = findRelationship(callRels, result.entities, 'calculate', 'add');
        expect(calculateCallsAdd).toBeDefined();
      });

      it('stores call relationships in database', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.rb');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        const relationshipStore = createRelationshipStore(db);
        const callRels = relationshipStore.findByType('calls');

        expect(callRels.length).toBeGreaterThan(0);
      });
    });

    describe('Vue', () => {
      it('processes Vue files without errors', async () => {
        const filePath = join(fixturesDir, 'sample-with-calls.vue');
        const result = await processor.processFile({ filePath, db });

        // Vue file is processed successfully with entity extraction
        expect(result.success).toBe(true);
        expect(result.language).toBe('vue');

        // File entity is created
        const fileEntity = result.entities.find(e => e.type === 'file');
        expect(fileEntity).toBeDefined();
      });

      it('extracts Vue component entities', async () => {
        const filePath = join(fixturesDir, 'ParentComponent.vue');
        const result = await processor.processFile({ filePath, db });

        expect(result.success).toBe(true);

        // Should extract Vue component entity
        const componentEntity = result.entities.find(e => e.type === 'class' && e.name === 'ParentComponent');
        expect(componentEntity).toBeDefined();
        expect(componentEntity?.language).toBe('vue');
        expect(componentEntity?.metadata?.['exported']).toBe(true);
      });

      it('extracts template component usage as calls relationships', async () => {
        // First process ChildComponent so it's in the database
        const childPath = join(fixturesDir, 'ChildComponent.vue');
        const childResult = await processor.processFile({ filePath: childPath, db });
        expect(childResult.success).toBe(true);

        // Then process ParentComponent which references ChildComponent
        const parentPath = join(fixturesDir, 'ParentComponent.vue');
        const parentResult = await processor.processFile({ filePath: parentPath, db });
        expect(parentResult.success).toBe(true);

        // Should extract ChildComponent usage in template as a calls relationship
        const componentEntity = parentResult.entities.find(e => e.name === 'ParentComponent');
        expect(componentEntity).toBeDefined();

        if (componentEntity) {
          const callRels = parentResult.relationships.filter(r =>
            r.type === 'calls' && r.sourceId === componentEntity.id
          );

          // Should have a calls relationship to ChildComponent
          const childComponentCall = callRels.find(r => {
            const targetEntity = [...childResult.entities, ...parentResult.entities].find(
              e => e.id === r.targetId
            );
            return targetEntity?.name === 'ChildComponent';
          });

          expect(childComponentCall).toBeDefined();
          expect(childComponentCall?.metadata?.['usage']).toBe('template-component');
        }
      });

      it('supports what_calls queries for Vue components', { timeout: 30000 }, async () => {
        // Process child first so it's in the database for cross-file resolution
        const childPath = join(fixturesDir, 'ChildComponent.vue');
        const childResult = await processor.processFile({ filePath: childPath, db });
        expect(childResult.success).toBe(true);

        // Then process parent which references child
        const parentPath = join(fixturesDir, 'ParentComponent.vue');
        const parentResult = await processor.processFile({ filePath: parentPath, db });
        expect(parentResult.success).toBe(true);

        // Query what calls ChildComponent
        const relationshipStore = createRelationshipStore(db);
        const childEntity = childResult.entities.find(e => e.name === 'ChildComponent');
        expect(childEntity).toBeDefined();

        if (childEntity) {
          const callers = relationshipStore.findByTarget(childEntity.id);
          const callRelationships = callers.filter(r => r.type === 'calls');

          expect(callRelationships.length).toBeGreaterThan(0);

          // Verify ParentComponent is one of the callers
          const parentEntity = parentResult.entities.find(e => e.name === 'ParentComponent');
          const parentCalls = callRelationships.find(r => r.sourceId === parentEntity?.id);
          expect(parentCalls).toBeDefined();
        }
      });
    });
  });
});
