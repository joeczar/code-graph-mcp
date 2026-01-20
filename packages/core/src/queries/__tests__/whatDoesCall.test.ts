import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase } from '../../db/connection.js';
import { initializeSchema } from '../../db/schema.js';
import { createEntityStore } from '../../db/entities.js';
import { createRelationshipStore } from '../../db/relationships.js';
import { whatDoesCall } from '../whatDoesCall.js';

describe('whatDoesCall', () => {
  let entityStore: ReturnType<typeof createEntityStore>;
  let relationshipStore: ReturnType<typeof createRelationshipStore>;

  beforeEach(() => {
    const db = getDatabase();
    initializeSchema(db);
    entityStore = createEntityStore(db);
    relationshipStore = createRelationshipStore(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  it('should return single callee', () => {
    // Create caller function
    const caller = entityStore.create({
      type: 'function',
      name: 'processData',
      filePath: '/src/main.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Create callee function
    const callee = entityStore.create({
      type: 'function',
      name: 'validateInput',
      filePath: '/src/utils.ts',
      startLine: 10,
      endLine: 15,
      language: 'typescript',
    });

    // Create relationship: processData calls validateInput
    relationshipStore.create({
      sourceId: caller.id,
      targetId: callee.id,
      type: 'calls',
    });

    const result = whatDoesCall('processData', entityStore, relationshipStore);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('validateInput');
    expect(result[0]!.type).toBe('function');
    expect(result[0]!.filePath).toBe('/src/utils.ts');
  });

  it('should return multiple callees', () => {
    // Create caller function
    const caller = entityStore.create({
      type: 'function',
      name: 'main',
      filePath: '/src/index.ts',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
    });

    // Create multiple callee functions
    const callee1 = entityStore.create({
      type: 'function',
      name: 'setup',
      filePath: '/src/setup.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const callee2 = entityStore.create({
      type: 'function',
      name: 'run',
      filePath: '/src/runner.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const callee3 = entityStore.create({
      type: 'function',
      name: 'cleanup',
      filePath: '/src/cleanup.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Create call relationships
    relationshipStore.create({
      sourceId: caller.id,
      targetId: callee1.id,
      type: 'calls',
    });
    relationshipStore.create({
      sourceId: caller.id,
      targetId: callee2.id,
      type: 'calls',
    });
    relationshipStore.create({
      sourceId: caller.id,
      targetId: callee3.id,
      type: 'calls',
    });

    const result = whatDoesCall('main', entityStore, relationshipStore);

    expect(result).toHaveLength(3);
    const names = result.map(e => e.name).sort();
    expect(names).toEqual(['cleanup', 'run', 'setup']);
  });

  it('should return empty array when entity calls nothing', () => {
    // Create function that doesn't call anything
    entityStore.create({
      type: 'function',
      name: 'leaf',
      filePath: '/src/leaf.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const result = whatDoesCall('leaf', entityStore, relationshipStore);

    expect(result).toEqual([]);
  });

  it('should return empty array for non-existent entity', () => {
    const result = whatDoesCall('doesNotExist', entityStore, relationshipStore);

    expect(result).toEqual([]);
  });

  it('should filter to only "calls" relationships', () => {
    // Create entities
    const source = entityStore.create({
      type: 'class',
      name: 'MyClass',
      filePath: '/src/class.ts',
      startLine: 1,
      endLine: 20,
      language: 'typescript',
    });

    const callTarget = entityStore.create({
      type: 'function',
      name: 'helper',
      filePath: '/src/helper.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const importTarget = entityStore.create({
      type: 'module',
      name: 'utils',
      filePath: '/src/utils.ts',
      startLine: 1,
      endLine: 1,
      language: 'typescript',
    });

    // Create different relationship types
    relationshipStore.create({
      sourceId: source.id,
      targetId: callTarget.id,
      type: 'calls',
    });
    relationshipStore.create({
      sourceId: source.id,
      targetId: importTarget.id,
      type: 'imports',
    });

    const result = whatDoesCall('MyClass', entityStore, relationshipStore);

    // Should only include the "calls" relationship
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('helper');
  });

  it('should handle multiple entities with same name', () => {
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

    const callee1 = entityStore.create({
      type: 'function',
      name: 'validate',
      filePath: '/src/validate.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    const callee2 = entityStore.create({
      type: 'function',
      name: 'process',
      filePath: '/src/process.ts',
      startLine: 1,
      endLine: 5,
      language: 'typescript',
    });

    // Both helpers call different functions
    relationshipStore.create({
      sourceId: func1.id,
      targetId: callee1.id,
      type: 'calls',
    });
    relationshipStore.create({
      sourceId: func2.id,
      targetId: callee2.id,
      type: 'calls',
    });

    const result = whatDoesCall('helper', entityStore, relationshipStore);

    // Should return callees from both helpers
    expect(result).toHaveLength(2);
    const names = result.map(e => e.name).sort();
    expect(names).toEqual(['process', 'validate']);
  });
});
