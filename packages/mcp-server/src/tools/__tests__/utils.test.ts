import { describe, it, expect } from 'vitest';
import { deduplicateEntities, formatEntityList } from '../utils.js';
import type { Entity } from '@code-graph/core';

describe('deduplicateEntities', () => {
  it('should return empty array for empty input', () => {
    expect(deduplicateEntities([])).toEqual([]);
  });

  it('should return same entities when no duplicates', () => {
    const entities: Entity[] = [
      {
        id: '1',
        type: 'function',
        name: 'func1',
        filePath: '/file1.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      },
      {
        id: '2',
        type: 'function',
        name: 'func2',
        filePath: '/file2.ts',
        startLine: 5,
        endLine: 15,
        language: 'typescript',
      },
    ];

    const result = deduplicateEntities(entities);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('1');
    expect(result[1]?.id).toBe('2');
  });

  it('should deduplicate entities with same name, file, and startLine', () => {
    const entities: Entity[] = [
      {
        id: '1',
        type: 'function',
        name: 'duplicateFunc',
        filePath: '/test.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      },
      {
        id: '2', // Different ID
        type: 'function',
        name: 'duplicateFunc', // Same name
        filePath: '/test.ts', // Same file
        startLine: 10, // Same startLine
        endLine: 20,
        language: 'typescript',
      },
    ];

    const result = deduplicateEntities(entities);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('1'); // Should keep first occurrence
  });

  it('should preserve order while deduplicating', () => {
    const entities: Entity[] = [
      {
        id: 'first',
        type: 'function',
        name: 'alpha',
        filePath: '/a.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      },
      {
        id: 'duplicate-1',
        type: 'function',
        name: 'beta',
        filePath: '/b.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      },
      {
        id: 'third',
        type: 'function',
        name: 'gamma',
        filePath: '/c.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      },
      {
        id: 'duplicate-2',
        type: 'function',
        name: 'beta', // Duplicate of second
        filePath: '/b.ts',
        startLine: 1,
        endLine: 5,
        language: 'typescript',
      },
    ];

    const result = deduplicateEntities(entities);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.name)).toEqual(['alpha', 'beta', 'gamma']);
    expect(result[1]?.id).toBe('duplicate-1'); // First beta should be kept
  });

  it('should not deduplicate entities with same name but different file', () => {
    const entities: Entity[] = [
      {
        id: '1',
        type: 'function',
        name: 'commonName',
        filePath: '/file1.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      },
      {
        id: '2',
        type: 'function',
        name: 'commonName',
        filePath: '/file2.ts', // Different file
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      },
    ];

    const result = deduplicateEntities(entities);
    expect(result).toHaveLength(2);
  });

  it('should not deduplicate entities with same name and file but different startLine', () => {
    const entities: Entity[] = [
      {
        id: '1',
        type: 'function',
        name: 'overloadedFunc',
        filePath: '/utils.ts',
        startLine: 10,
        endLine: 20,
        language: 'typescript',
      },
      {
        id: '2',
        type: 'function',
        name: 'overloadedFunc',
        filePath: '/utils.ts',
        startLine: 25, // Different startLine (e.g., function overload)
        endLine: 35,
        language: 'typescript',
      },
    ];

    const result = deduplicateEntities(entities);
    expect(result).toHaveLength(2);
  });

  it('should handle multiple duplicates of the same entity', () => {
    const entities: Entity[] = [
      {
        id: '1',
        type: 'function',
        name: 'multiDupe',
        filePath: '/test.ts',
        startLine: 5,
        endLine: 15,
        language: 'typescript',
      },
      {
        id: '2',
        type: 'function',
        name: 'multiDupe',
        filePath: '/test.ts',
        startLine: 5,
        endLine: 15,
        language: 'typescript',
      },
      {
        id: '3',
        type: 'function',
        name: 'multiDupe',
        filePath: '/test.ts',
        startLine: 5,
        endLine: 15,
        language: 'typescript',
      },
    ];

    const result = deduplicateEntities(entities);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('1');
  });
});

describe('formatEntityList', () => {
  it('should deduplicate entities in output', () => {
    const entities: Entity[] = [
      {
        id: '1',
        type: 'function',
        name: 'testFunc',
        filePath: '/test.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      },
      {
        id: '2',
        type: 'function',
        name: 'testFunc',
        filePath: '/test.ts',
        startLine: 1,
        endLine: 10,
        language: 'typescript',
      },
    ];

    const output = formatEntityList(entities, {
      title: 'Test Results:',
      emptyMessage: 'No results',
      itemLabel: 'entity',
    });

    expect(output).toContain('Total: 1 entity found');
    expect(output).toContain('1. testFunc');
    expect(output).not.toContain('2. testFunc');
  });
});
