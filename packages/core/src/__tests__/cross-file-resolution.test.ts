import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { initializeSchema } from '../db/schema.js';
import { createEntityStore } from '../db/entities.js';
import { createRelationshipStore } from '../db/relationships.js';
import { TsMorphFileProcessor } from '../graph/ts-morph-file-processor.js';
import { whatCalls } from '../queries/whatCalls.js';
import { whatDoesCall } from '../queries/whatDoesCall.js';
import { blastRadius } from '../queries/blastRadius.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'cross-file-project');

/**
 * Integration tests for cross-file relationship resolution.
 *
 * These tests verify end-to-end functionality:
 * 1. Parse real TypeScript files with cross-file dependencies
 * 2. Store entities and relationships in the database
 * 3. Query relationships using whatCalls, whatDoesCall, and blastRadius
 *
 * Unlike unit tests that use mocked data, these tests use real file parsing
 * via TsMorphFileProcessor to verify the complete pipeline.
 *
 * NOTE: blastRadius uses relative file paths (as stored in the database),
 * not absolute paths. This matches how entities are stored by TsMorphFileProcessor.
 */
describe('Cross-file resolution integration tests', () => {
  let db: Database.Database;
  let entityStore: ReturnType<typeof createEntityStore>;
  let relationshipStore: ReturnType<typeof createRelationshipStore>;
  let processor: TsMorphFileProcessor;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    initializeSchema(db);
    entityStore = createEntityStore(db);
    relationshipStore = createRelationshipStore(db);
    processor = new TsMorphFileProcessor();

    // Create fixture directory structure
    mkdirSync(fixturesDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up fixtures
    rmSync(fixturesDir, { recursive: true, force: true });
    db.close();
  });

  describe('Simple cross-file function calls', () => {
    beforeEach(() => {
      // utils.ts - exports helper functions
      writeFileSync(
        join(fixturesDir, 'utils.ts'),
        `export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseNumber(str: string): number {
  return parseInt(str, 10);
}
`
      );

      // service.ts - imports and uses utils
      writeFileSync(
        join(fixturesDir, 'service.ts'),
        `import { formatDate, parseNumber } from './utils';

export function processData(dateStr: string, numStr: string) {
  const date = new Date(dateStr);
  const formatted = formatDate(date);
  const num = parseNumber(numStr);
  return { formatted, num };
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('whatCalls finds callers across files', () => {
      // formatDate is called by processData
      const callers = whatCalls('formatDate', entityStore, relationshipStore);

      expect(callers).toHaveLength(1);
      expect(callers[0]?.name).toBe('processData');
      expect(callers[0]?.filePath).toContain('service.ts');
    });

    it('whatDoesCall finds callees across files', () => {
      // processData calls formatDate and parseNumber
      const callees = whatDoesCall('processData', entityStore, relationshipStore);

      expect(callees.length).toBeGreaterThanOrEqual(2);
      const calleeNames = callees.map(c => c.name);
      expect(calleeNames).toContain('formatDate');
      expect(calleeNames).toContain('parseNumber');
    });

    it('blastRadius includes cross-file dependents', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'utils.ts',
        entityStore,
        relationshipStore
      );

      // Changes to utils.ts should affect processData in service.ts
      expect(result.affectedEntities.length).toBeGreaterThan(0);
      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('processData');
    });
  });

  describe('Class inheritance across files', () => {
    beforeEach(() => {
      // base-class.ts
      writeFileSync(
        join(fixturesDir, 'base-class.ts'),
        `export class BaseService {
  protected name: string;

  constructor(name: string) {
    this.name = name;
  }

  getName(): string {
    return this.name;
  }
}
`
      );

      // derived-class.ts - extends BaseService
      writeFileSync(
        join(fixturesDir, 'derived-class.ts'),
        `import { BaseService } from './base-class';

export class UserService extends BaseService {
  private userId: string;

  constructor(name: string, userId: string) {
    super(name);
    this.userId = userId;
  }

  getUserId(): string {
    return this.userId;
  }
}
`
      );

      // consumer.ts - uses UserService
      writeFileSync(
        join(fixturesDir, 'consumer.ts'),
        `import { UserService } from './derived-class';

export function createUser(name: string, id: string): UserService {
  return new UserService(name, id);
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('blastRadius traverses extends relationships', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'base-class.ts',
        entityStore,
        relationshipStore
      );

      // Changes to BaseService should affect UserService (extends) and createUser (transitively)
      expect(result.affectedEntities.length).toBeGreaterThan(0);
      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('UserService');
    });

    it('blastRadius shows correct depth for transitive dependencies', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'base-class.ts',
        entityStore,
        relationshipStore,
        5
      );

      // UserService should be at depth 0 (direct dependent via extends)
      const userServiceAffected = result.affectedEntities.find(
        ae => ae.entity.name === 'UserService'
      );
      if (userServiceAffected) {
        expect(userServiceAffected.depth).toBe(0);
      }

      // createUser should be at depth >= 1 (depends on UserService)
      const createUserAffected = result.affectedEntities.find(
        ae => ae.entity.name === 'createUser'
      );
      if (createUserAffected) {
        expect(createUserAffected.depth).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Complex dependency chains', () => {
    beforeEach(() => {
      // core.ts - core utility
      writeFileSync(
        join(fixturesDir, 'core.ts'),
        `export function validate(input: string): boolean {
  return input.length > 0;
}
`
      );

      // middleware.ts - uses core
      writeFileSync(
        join(fixturesDir, 'middleware.ts'),
        `import { validate } from './core';

export function validateRequest(req: { body: string }): boolean {
  return validate(req.body);
}
`
      );

      // handler.ts - uses middleware
      writeFileSync(
        join(fixturesDir, 'handler.ts'),
        `import { validateRequest } from './middleware';

export function handleRequest(req: { body: string }): string {
  if (!validateRequest(req)) {
    throw new Error('Invalid request');
  }
  return 'OK';
}
`
      );

      // router.ts - uses handler
      writeFileSync(
        join(fixturesDir, 'router.ts'),
        `import { handleRequest } from './handler';

export function route(req: { body: string }): string {
  return handleRequest(req);
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('whatCalls finds indirect callers in chain', () => {
      // validate is called by validateRequest
      const callers = whatCalls('validate', entityStore, relationshipStore);

      expect(callers.length).toBeGreaterThan(0);
      expect(callers.some(c => c.name === 'validateRequest')).toBe(true);
    });

    it('whatDoesCall works through import chain', () => {
      // route calls handleRequest
      const callees = whatDoesCall('route', entityStore, relationshipStore);

      expect(callees.length).toBeGreaterThan(0);
      expect(callees.some(c => c.name === 'handleRequest')).toBe(true);
    });

    it('blastRadius traverses multi-level dependencies', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'core.ts',
        entityStore,
        relationshipStore,
        5
      );

      // Changes to core.ts should affect the whole chain
      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('validateRequest');

      // Verify depth increases through the chain
      const maxDepth = result.summary.maxDepth;
      expect(maxDepth).toBeGreaterThan(0);
    });

    it('blastRadius respects maxDepth limit', () => {
      // blastRadius uses relative file paths (as stored in database)
      // With depth limit of 1, should only get direct dependents
      const result = blastRadius(
        'core.ts',
        entityStore,
        relationshipStore,
        1
      );

      // Should include validateRequest (depth 0) but potentially not the full chain
      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('validateRequest');

      // All affected should be at depth 0
      expect(result.affectedEntities.every(ae => ae.depth === 0)).toBe(true);
    });
  });

  describe('Multiple callers scenario', () => {
    beforeEach(() => {
      // shared.ts - shared utility function
      writeFileSync(
        join(fixturesDir, 'shared.ts'),
        `export function log(message: string): void {
  console.log(message);
}
`
      );

      // module-a.ts - uses shared
      writeFileSync(
        join(fixturesDir, 'module-a.ts'),
        `import { log } from './shared';

export function operationA(): void {
  log('Operation A');
}
`
      );

      // module-b.ts - also uses shared
      writeFileSync(
        join(fixturesDir, 'module-b.ts'),
        `import { log } from './shared';

export function operationB(): void {
  log('Operation B');
}
`
      );

      // module-c.ts - also uses shared
      writeFileSync(
        join(fixturesDir, 'module-c.ts'),
        `import { log } from './shared';

export function operationC(): void {
  log('Operation C');
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('whatCalls finds all cross-file callers', () => {
      const callers = whatCalls('log', entityStore, relationshipStore);

      expect(callers.length).toBeGreaterThanOrEqual(3);
      const callerNames = callers.map(c => c.name);
      expect(callerNames).toContain('operationA');
      expect(callerNames).toContain('operationB');
      expect(callerNames).toContain('operationC');
    });

    it('blastRadius shows all direct dependents', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'shared.ts',
        entityStore,
        relationshipStore
      );

      expect(result.summary.directDependents).toBeGreaterThanOrEqual(3);
      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('operationA');
      expect(affectedNames).toContain('operationB');
      expect(affectedNames).toContain('operationC');
    });
  });

  describe('Method calls on imported classes', () => {
    beforeEach(() => {
      // calculator.ts - class with methods
      writeFileSync(
        join(fixturesDir, 'calculator.ts'),
        `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}
`
      );

      // math-operations.ts - uses Calculator methods
      writeFileSync(
        join(fixturesDir, 'math-operations.ts'),
        `import { Calculator } from './calculator';

export function calculate(a: number, b: number): { sum: number; diff: number } {
  const calc = new Calculator();
  return {
    sum: calc.add(a, b),
    diff: calc.subtract(a, b),
  };
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('whatCalls finds callers of methods across files', () => {
      // Calculator.add is called by calculate
      const addCallers = whatCalls('Calculator.add', entityStore, relationshipStore);

      expect(addCallers.length).toBeGreaterThan(0);
      expect(addCallers.some(c => c.name === 'calculate')).toBe(true);
    });

    it('whatDoesCall includes method calls on imported classes', () => {
      const callees = whatDoesCall('calculate', entityStore, relationshipStore);

      const calleeNames = callees.map(c => c.name);
      // Should include both method calls
      expect(calleeNames).toContain('Calculator.add');
      expect(calleeNames).toContain('Calculator.subtract');
    });

    it('blastRadius includes method callers', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'calculator.ts',
        entityStore,
        relationshipStore
      );

      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('calculate');
    });
  });

  describe('Interface implementation across files', () => {
    beforeEach(() => {
      // interfaces.ts - interface definitions
      writeFileSync(
        join(fixturesDir, 'interfaces.ts'),
        `export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export interface Formatter {
  format(data: unknown): string;
}
`
      );

      // implementations.ts - implements interfaces
      writeFileSync(
        join(fixturesDir, 'implementations.ts'),
        `import { Logger, Formatter } from './interfaces';

export class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(message);
  }

  error(message: string): void {
    console.error(message);
  }
}

export class JsonFormatter implements Formatter {
  format(data: unknown): string {
    return JSON.stringify(data);
  }
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('blastRadius traverses implements relationships', () => {
      // blastRadius uses relative file paths (as stored in database)
      const result = blastRadius(
        'interfaces.ts',
        entityStore,
        relationshipStore
      );

      // Changes to interfaces should affect implementing classes
      const affectedNames = result.affectedEntities.map(ae => ae.entity.name);
      expect(affectedNames).toContain('ConsoleLogger');
      expect(affectedNames).toContain('JsonFormatter');
    });
  });

  describe('Re-exports and barrel files', () => {
    beforeEach(() => {
      // components/button.ts
      mkdirSync(join(fixturesDir, 'components'), { recursive: true });
      writeFileSync(
        join(fixturesDir, 'components', 'button.ts'),
        `export function Button(props: { label: string }): string {
  return props.label;
}
`
      );

      // components/input.ts
      writeFileSync(
        join(fixturesDir, 'components', 'input.ts'),
        `export function Input(props: { value: string }): string {
  return props.value;
}
`
      );

      // components/index.ts - barrel file
      writeFileSync(
        join(fixturesDir, 'components', 'index.ts'),
        `export { Button } from './button';
export { Input } from './input';
`
      );

      // app.ts - imports from barrel
      writeFileSync(
        join(fixturesDir, 'app.ts'),
        `import { Button, Input } from './components';

export function App(): string {
  return Button({ label: 'Click' }) + Input({ value: 'text' });
}
`
      );

      // Parse the project
      const result = processor.processProject({
        projectPath: fixturesDir,
        db,
      });
      expect(result.success).toBe(true);
    });

    it('whatDoesCall resolves through barrel imports', () => {
      const callees = whatDoesCall('App', entityStore, relationshipStore);

      const calleeNames = callees.map(c => c.name);
      expect(calleeNames).toContain('Button');
      expect(calleeNames).toContain('Input');
    });
  });
});
