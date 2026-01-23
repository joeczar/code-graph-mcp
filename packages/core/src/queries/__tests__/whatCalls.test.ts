import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema } from '../../db/schema.js';
import { createEntityStore } from '../../db/entities.js';
import { createRelationshipStore } from '../../db/relationships.js';
import { whatCalls } from '../whatCalls.js';

describe('whatCalls', () => {
  let db: Database.Database;
  let entityStore: ReturnType<typeof createEntityStore>;
  let relStore: ReturnType<typeof createRelationshipStore>;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    initializeSchema(db);
    entityStore = createEntityStore(db);
    relStore = createRelationshipStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should find a single caller', () => {
    // Create target function
    const target = entityStore.create({
      type: 'function',
      name: 'calculateTotal',
      filePath: '/src/utils.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    // Create caller function
    const caller = entityStore.create({
      type: 'function',
      name: 'processOrder',
      filePath: '/src/orders.ts',
      startLine: 20,
      endLine: 30,
      language: 'typescript',
    });

    // Create 'calls' relationship
    relStore.create({
      sourceId: caller.id,
      targetId: target.id,
      type: 'calls',
    });

    // Query for callers
    const result = whatCalls('calculateTotal', entityStore, relStore);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('processOrder');
    expect(result[0]?.filePath).toBe('/src/orders.ts');
  });

  it('should find multiple callers from different files', () => {
    // Create target function
    const target = entityStore.create({
      type: 'function',
      name: 'validateUser',
      filePath: '/src/auth.ts',
      startLine: 5,
      endLine: 10,
      language: 'typescript',
    });

    // Create first caller
    const caller1 = entityStore.create({
      type: 'function',
      name: 'login',
      filePath: '/src/auth.ts',
      startLine: 20,
      endLine: 30,
      language: 'typescript',
    });

    // Create second caller in different file
    const caller2 = entityStore.create({
      type: 'function',
      name: 'register',
      filePath: '/src/registration.ts',
      startLine: 15,
      endLine: 25,
      language: 'typescript',
    });

    // Create 'calls' relationships
    relStore.create({
      sourceId: caller1.id,
      targetId: target.id,
      type: 'calls',
    });

    relStore.create({
      sourceId: caller2.id,
      targetId: target.id,
      type: 'calls',
    });

    // Query for callers
    const result = whatCalls('validateUser', entityStore, relStore);

    expect(result).toHaveLength(2);
    const names = result.map(e => e.name).sort();
    expect(names).toEqual(['login', 'register']);
  });

  it('should return empty array when entity has no callers', () => {
    // Create function with no callers
    entityStore.create({
      type: 'function',
      name: 'unusedFunction',
      filePath: '/src/unused.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = whatCalls('unusedFunction', entityStore, relStore);

    expect(result).toEqual([]);
  });

  it('should return empty array when entity does not exist', () => {
    const result = whatCalls('nonExistentFunction', entityStore, relStore);

    expect(result).toEqual([]);
  });

  it('should include extends relationships as dependencies', () => {
    // Create target class (parent/base class)
    const targetClass = entityStore.create({
      type: 'class',
      name: 'ApplicationController',
      filePath: '/app/controllers/application_controller.rb',
      startLine: 1,
      endLine: 20,
      language: 'ruby',
    });

    // Create extending class (child class that depends on parent)
    const extendingClass = entityStore.create({
      type: 'class',
      name: 'UsersController',
      filePath: '/app/controllers/users_controller.rb',
      startLine: 1,
      endLine: 30,
      language: 'ruby',
    });

    // Create calling function
    const callingFunction = entityStore.create({
      type: 'function',
      name: 'initServices',
      filePath: '/src/init.ts',
      startLine: 5,
      endLine: 10,
      language: 'typescript',
    });

    // Create 'extends' relationship (should be included - child depends on parent)
    relStore.create({
      sourceId: extendingClass.id,
      targetId: targetClass.id,
      type: 'extends',
    });

    // Create 'calls' relationship (should also be included)
    relStore.create({
      sourceId: callingFunction.id,
      targetId: targetClass.id,
      type: 'calls',
    });

    // Query for callers - should return BOTH extending class and calling function
    const result = whatCalls('ApplicationController', entityStore, relStore);

    expect(result).toHaveLength(2);
    const names = result.map(e => e.name).sort();
    expect(names).toEqual(['UsersController', 'initServices']);
  });

  it('should include implements relationships as dependencies', () => {
    // Create target module
    const targetModule = entityStore.create({
      type: 'module',
      name: 'Authentication',
      filePath: '/app/concerns/authentication.rb',
      startLine: 1,
      endLine: 50,
      language: 'ruby',
    });

    // Create including class (includes the module)
    const includingClass = entityStore.create({
      type: 'class',
      name: 'UsersController',
      filePath: '/app/controllers/users_controller.rb',
      startLine: 1,
      endLine: 30,
      language: 'ruby',
    });

    // Create 'implements' relationship (class includes/extends module)
    relStore.create({
      sourceId: includingClass.id,
      targetId: targetModule.id,
      type: 'implements',
    });

    // Query for callers - should return the including class
    const result = whatCalls('Authentication', entityStore, relStore);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('UsersController');
  });

  it('should exclude imports relationships from callers', () => {
    // Create target module
    const targetModule = entityStore.create({
      type: 'module',
      name: 'utils',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 50,
      language: 'typescript',
    });

    // Create importing file
    const importingFile = entityStore.create({
      type: 'file',
      name: 'main',
      filePath: '/src/main.ts',
      startLine: 1,
      endLine: 100,
      language: 'typescript',
    });

    // Create 'imports' relationship (should NOT be included)
    relStore.create({
      sourceId: importingFile.id,
      targetId: targetModule.id,
      type: 'imports',
    });

    // Query for callers - should be empty since imports are not dependencies
    const result = whatCalls('utils', entityStore, relStore);

    expect(result).toHaveLength(0);
  });

  it('should handle multiple entities with the same name', () => {
    // Create two functions with same name in different files
    const func1 = entityStore.create({
      type: 'function',
      name: 'helper',
      filePath: '/src/utils1.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const func2 = entityStore.create({
      type: 'function',
      name: 'helper',
      filePath: '/src/utils2.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Create callers for each
    const caller1 = entityStore.create({
      type: 'function',
      name: 'useHelper1',
      filePath: '/src/main1.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    const caller2 = entityStore.create({
      type: 'function',
      name: 'useHelper2',
      filePath: '/src/main2.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    relStore.create({
      sourceId: caller1.id,
      targetId: func1.id,
      type: 'calls',
    });

    relStore.create({
      sourceId: caller2.id,
      targetId: func2.id,
      type: 'calls',
    });

    // Should return callers for both entities with the same name
    const result = whatCalls('helper', entityStore, relStore);

    expect(result).toHaveLength(2);
    const names = result.map(e => e.name).sort();
    expect(names).toEqual(['useHelper1', 'useHelper2']);
  });
});
