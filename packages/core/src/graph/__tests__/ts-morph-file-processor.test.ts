import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { getDatabase, resetDatabase } from '../../db/connection.js';
import { initializeSchema } from '../../db/schema.js';
import { TsMorphFileProcessor } from '../ts-morph-file-processor.js';
import { createEntityStore } from '../../db/entities.js';
import { createRelationshipStore } from '../../db/relationships.js';
import type Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'ts-morph-project');

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

describe('TsMorphFileProcessor', () => {
  let processor: TsMorphFileProcessor;
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database for each test
    db = getDatabase();
    initializeSchema(db);
    processor = new TsMorphFileProcessor();

    // Create test fixture directory
    mkdirSync(fixturesDir, { recursive: true });

    // Create test files with cross-file imports
    writeFileSync(
      join(fixturesDir, 'utils.ts'),
      `/**
 * Adds two numbers
 * @param a First number
 * @param b Second number
 */
export function add(a: number, b: number): number {
  return a + b;
}

export class Calculator {
  multiply(a: number, b: number): number {
    return a * b;
  }
}

export type UserId = string;
`
    );

    writeFileSync(
      join(fixturesDir, 'main.ts'),
      `import { add, Calculator } from './utils';

export function main() {
  const result = add(1, 2);
  const calc = new Calculator();
  const product = calc.multiply(3, 4);
  return result + product;
}
`
    );

    writeFileSync(
      join(fixturesDir, 'advanced.ts'),
      `import { Calculator } from './utils';

export class AdvancedCalculator extends Calculator {
  power(base: number, exponent: number): number {
    return Math.pow(base, exponent);
  }
}
`
    );
  });

  afterEach(() => {
    // Clean up test fixtures
    rmSync(fixturesDir, { recursive: true, force: true });
    // Reset database singleton
    resetDatabase();
  });

  describe('Project processing', () => {
    it('processes project successfully', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);
      expect(result.projectPath).toBe(fixturesDir);
      expect(result.error).toBeUndefined();
    });

    it('returns statistics about parsed project', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats?.filesScanned).toBe(3);
      expect(result.stats?.entitiesByType).toBeDefined();
      expect(result.stats?.relationshipsByType).toBeDefined();
    });

    it('handles non-existent directory gracefully', () => {
      const result = processor.processProject({
        projectPath: join(fixturesDir, 'does-not-exist'),
        db,
      });

      // globby returns empty array for non-existent directories
      // This results in a successful parse with 0 files
      expect(result.success).toBe(true);
      expect(result.stats?.filesScanned).toBe(0);
      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
    });
  });

  describe('Entity extraction', () => {
    it('extracts functions from all files', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const functions = result.entities.filter(e => e.type === 'function');
      expect(functions.length).toBeGreaterThan(0);

      const addFunc = functions.find(f => f.name === 'add');
      expect(addFunc).toBeDefined();
      expect(addFunc?.language).toBe('typescript');
      expect(addFunc?.startLine).toBeGreaterThan(0);
    });

    it('extracts classes from all files', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const classes = result.entities.filter(e => e.type === 'class');
      expect(classes.length).toBeGreaterThanOrEqual(2);

      const calcClass = classes.find(c => c.name === 'Calculator');
      expect(calcClass).toBeDefined();

      const advCalcClass = classes.find(c => c.name === 'AdvancedCalculator');
      expect(advCalcClass).toBeDefined();
    });

    it('extracts methods from classes', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const methods = result.entities.filter(e => e.type === 'method');
      expect(methods.length).toBeGreaterThan(0);

      const multiplyMethod = methods.find(m => m.name === 'Calculator.multiply');
      expect(multiplyMethod).toBeDefined();

      const powerMethod = methods.find(m => m.name === 'AdvancedCalculator.power');
      expect(powerMethod).toBeDefined();
    });

    it('extracts type aliases', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const types = result.entities.filter(e => e.type === 'type');
      expect(types.length).toBeGreaterThan(0);

      const userIdType = types.find(t => t.name === 'UserId');
      expect(userIdType).toBeDefined();
    });

    it('extracts file entities', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const files = result.entities.filter(e => e.type === 'file');
      expect(files.length).toBe(3); // utils.ts, main.ts, advanced.ts
    });
  });

  describe('Exported flag metadata', () => {
    it('sets exported flag for exported entities', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const addFunc = result.entities.find(e => e.name === 'add' && e.type === 'function');
      expect(addFunc).toBeDefined();
      expect(addFunc?.metadata?.['exported']).toBe(true);

      const mainFunc = result.entities.find(e => e.name === 'main' && e.type === 'function');
      expect(mainFunc).toBeDefined();
      expect(mainFunc?.metadata?.['exported']).toBe(true);
    });

    it('sets exported flag to false for non-exported entities', () => {
      // Add a non-exported function to test file
      writeFileSync(
        join(fixturesDir, 'helper.ts'),
        `function internalHelper() {
  return 42;
}

export function publicHelper() {
  return internalHelper();
}
`
      );

      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const internalFunc = result.entities.find(e => e.name === 'internalHelper');
      expect(internalFunc).toBeDefined();
      expect(internalFunc?.metadata?.['exported']).toBe(false);
    });
  });

  describe('JSDoc metadata', () => {
    it('preserves JSDoc content in metadata', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const addFunc = result.entities.find(e => e.name === 'add' && e.type === 'function');
      expect(addFunc).toBeDefined();
      expect(addFunc?.metadata?.['jsDocContent']).toBeDefined();
      expect(addFunc?.metadata?.['jsDocContent']).toContain('Adds two numbers');
      // JSDoc format is: "@param First number" not "@param a First number"
      expect(addFunc?.metadata?.['jsDocContent']).toContain('@param First number');
      expect(addFunc?.metadata?.['jsDocContent']).toContain('@param Second number');
    });
  });

  describe('Cross-file relationship resolution', () => {
    it('resolves function calls across files', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const callRels = result.relationships.filter(r => r.type === 'calls');
      expect(callRels.length).toBeGreaterThan(0);

      // main calls add (cross-file)
      const mainCallsAdd = findRelationship(callRels, result.entities, 'main', 'add');
      expect(mainCallsAdd).toBeDefined();
    });

    it('resolves class extends across files', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const extendsRels = result.relationships.filter(r => r.type === 'extends');
      expect(extendsRels.length).toBeGreaterThan(0);

      // AdvancedCalculator extends Calculator (cross-file)
      const advCalcExtendsCalc = findRelationship(
        extendsRels,
        result.entities,
        'AdvancedCalculator',
        'Calculator'
      );
      expect(advCalcExtendsCalc).toBeDefined();
    });

    it('resolves method calls on imported classes', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const callRels = result.relationships.filter(r => r.type === 'calls');

      // main calls Calculator.multiply (cross-file method call)
      const mainCallsMultiply = findRelationship(
        callRels,
        result.entities,
        'main',
        'Calculator.multiply'
      );
      expect(mainCallsMultiply).toBeDefined();
    });
  });

  describe('Database storage', () => {
    it('stores all entities in database', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const entityStore = createEntityStore(db);
      const totalEntities = entityStore.count();

      expect(totalEntities).toBe(result.entities.length);
      expect(totalEntities).toBeGreaterThan(0);
    });

    it('stores all relationships in database', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const relationshipStore = createRelationshipStore(db);
      const totalRelationships = relationshipStore.count();

      expect(totalRelationships).toBe(result.relationships.length);
    });

    it('stores entities with correct file paths', () => {
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const entityStore = createEntityStore(db);
      const addFunc = entityStore.findByName('add')[0];

      expect(addFunc).toBeDefined();
      expect(addFunc?.filePath).toContain('utils.ts');
    });
  });

  describe('Exclusion patterns', () => {
    it('respects exclusion patterns', () => {
      // Add a test file to exclude
      writeFileSync(
        join(fixturesDir, 'excluded.test.ts'),
        `export function testHelper() {
  return 'test';
}
`
      );

      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
        exclude: ['**/*.test.ts'],
      });

      expect(result.success).toBe(true);

      const testHelperEntity = result.entities.find(e => e.name === 'testHelper');
      expect(testHelperEntity).toBeUndefined();

      // Verify other files were still processed
      const addFunc = result.entities.find(e => e.name === 'add');
      expect(addFunc).toBeDefined();
    });

    it('excludes node_modules by default', () => {
      // Create a fake node_modules directory
      const nodeModulesDir = join(fixturesDir, 'node_modules');
      mkdirSync(nodeModulesDir, { recursive: true });
      writeFileSync(
        join(nodeModulesDir, 'external.ts'),
        `export function external() {
  return 'external';
}
`
      );

      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result.success).toBe(true);

      const externalEntity = result.entities.find(e => e.name === 'external');
      expect(externalEntity).toBeUndefined();
    });
  });

  describe('Re-parsing idempotence', () => {
    it('re-parsing same project does not create duplicates', () => {
      // Parse project first time
      const result1 = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result1.success).toBe(true);

      const entityStore = createEntityStore(db);
      const relationshipStore = createRelationshipStore(db);

      const entitiesAfterFirst = entityStore.count();
      const relationshipsAfterFirst = relationshipStore.count();

      // Parse same project second time
      const result2 = processor.processProject({
        projectPath: fixturesDir,
        db,
      });

      expect(result2.success).toBe(true);

      const entitiesAfterSecond = entityStore.count();
      const relationshipsAfterSecond = relationshipStore.count();

      // Entity and relationship counts should remain the same
      expect(entitiesAfterSecond).toBe(entitiesAfterFirst);
      expect(relationshipsAfterSecond).toBe(relationshipsAfterFirst);

      // Verify specific entities don't have duplicates
      const addFuncs = entityStore.findByName('add');
      expect(addFuncs.length).toBe(1);

      const calcClasses = entityStore.findByName('Calculator');
      expect(calcClasses.length).toBe(1);
    });
  });
});
