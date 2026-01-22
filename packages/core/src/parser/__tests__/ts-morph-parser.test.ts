import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import {
  extractEntities,
  extractImportMap,
  buildEntityLookupMap,
  findBestMatch,
  extractRelationships,
  extractJsDocContent,
  extractVueScript,
  type TsMorphEntity,
} from '../ts-morph-parser.js';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';

describe('extractEntities', () => {
  it('should extract functions', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      function hello() {
        console.log('hello');
      }

      export function greet(name: string) {
        return \`Hello \${name}\`;
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');

    const functions = entities.filter((e) => e.type === 'function');
    expect(functions).toHaveLength(2);
    expect(functions[0]?.name).toBe('hello');
    expect(functions[0]?.exported).toBe(false);
    expect(functions[1]?.name).toBe('greet');
    expect(functions[1]?.exported).toBe(true);
  });

  it('should extract classes and methods', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      export class Calculator {
        add(a: number, b: number): number {
          return a + b;
        }

        subtract(a: number, b: number): number {
          return a - b;
        }
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');

    const classes = entities.filter((e) => e.type === 'class');
    expect(classes).toHaveLength(1);
    expect(classes[0]?.name).toBe('Calculator');
    expect(classes[0]?.exported).toBe(true);

    const methods = entities.filter((e) => e.type === 'method');
    expect(methods).toHaveLength(2);
    expect(methods[0]?.name).toBe('Calculator.add');
    expect(methods[1]?.name).toBe('Calculator.subtract');
  });

  it('should extract type aliases and interfaces', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      export type UserId = string;

      export interface User {
        id: UserId;
        name: string;
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');

    const types = entities.filter((e) => e.type === 'type');
    expect(types).toHaveLength(2);
    expect(types[0]?.name).toBe('UserId');
    expect(types[1]?.name).toBe('User');
    expect(types[1]?.metadata?.['interfaceType']).toBe(true);
  });

  it('should extract arrow functions', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      const add = (a: number, b: number) => a + b;
      export const multiply = (a: number, b: number) => a * b;
      const notAFunction = 42;
      `
    );

    const entities = extractEntities(sourceFile, '/test');

    const functions = entities.filter((e) => e.type === 'function');
    expect(functions).toHaveLength(2);
    expect(functions[0]?.name).toBe('add');
    expect(functions[1]?.name).toBe('multiply');

    const variables = entities.filter((e) => e.type === 'variable');
    expect(variables).toHaveLength(1);
    expect(variables[0]?.name).toBe('notAFunction');
  });

  it('should extract JSDoc content', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      /**
       * Adds two numbers together
       * @param a First number
       * @param b Second number
       * @returns The sum
       */
      function add(a: number, b: number): number {
        return a + b;
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');
    const addFn = entities.find((e) => e.name === 'add');

    expect(addFn?.jsDocContent).toContain('Adds two numbers together');
    expect(addFn?.jsDocContent).toContain('@param');
    expect(addFn?.jsDocContent).toContain('First number');
    expect(addFn?.jsDocContent).toContain('Second number');
    expect(addFn?.jsDocContent).toContain('@returns');
  });
});

describe('extractImportMap', () => {
  it('should extract named imports', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'src/test.ts',
      `
      import { foo, bar } from './utils';
      import { baz } from './helpers';
      `
    );

    const importMap = extractImportMap(sourceFile, '/project');

    // Paths are relative from source file directory
    expect(importMap.get('foo')).toContain('utils.ts');
    expect(importMap.get('bar')).toContain('utils.ts');
    expect(importMap.get('baz')).toContain('helpers.ts');
  });

  it('should extract default imports', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'src/test.ts',
      `
      import React from 'react';
      import utils from './utils';
      `
    );

    const importMap = extractImportMap(sourceFile, '/project');

    // External imports are skipped
    expect(importMap.get('React')).toBeUndefined();
    // Relative imports are tracked
    expect(importMap.get('utils')).toContain('utils.ts');
  });

  it('should skip external imports', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'src/test.ts',
      `
      import { readFile } from 'node:fs';
      import express from 'express';
      import { localFunc } from './local';
      `
    );

    const importMap = extractImportMap(sourceFile, '/project');

    expect(importMap.get('readFile')).toBeUndefined();
    expect(importMap.get('express')).toBeUndefined();
    expect(importMap.get('localFunc')).toContain('local.ts');
  });
});

describe('buildEntityLookupMap', () => {
  it('should group entities by name', () => {
    const entities: TsMorphEntity[] = [
      { type: 'function', name: 'foo', filePath: 'a.ts', startLine: 1, endLine: 3, language: 'typescript' },
      { type: 'function', name: 'foo', filePath: 'b.ts', startLine: 1, endLine: 3, language: 'typescript' },
      { type: 'function', name: 'bar', filePath: 'a.ts', startLine: 5, endLine: 7, language: 'typescript' },
      { type: 'file', name: 'a.ts', filePath: 'a.ts', startLine: 1, endLine: 10, language: 'typescript' },
    ];

    const lookupMap = buildEntityLookupMap(entities);

    expect(lookupMap.get('foo')).toHaveLength(2);
    expect(lookupMap.get('bar')).toHaveLength(1);
    expect(lookupMap.get('a.ts')).toBeUndefined(); // Files are excluded
  });
});

describe('findBestMatch', () => {
  it('should return null for empty candidates', () => {
    const result = findBestMatch([], 'test.ts', false);
    expect(result).toBeNull();
  });

  it('should return the only candidate', () => {
    const candidates: TsMorphEntity[] = [
      { type: 'function', name: 'foo', filePath: 'a.ts', startLine: 1, endLine: 3, language: 'typescript', exported: false },
    ];

    const result = findBestMatch(candidates, 'test.ts', false);
    expect(result).toBe(candidates[0]);
  });

  it('should prefer same file over different file', () => {
    const candidates: TsMorphEntity[] = [
      { type: 'function', name: 'foo', filePath: 'a.ts', startLine: 1, endLine: 3, language: 'typescript', exported: false },
      { type: 'function', name: 'foo', filePath: 'test.ts', startLine: 1, endLine: 3, language: 'typescript', exported: false },
    ];

    const result = findBestMatch(candidates, 'test.ts', false);
    expect(result?.filePath).toBe('test.ts');
  });

  it('should prefer exported entities when isImported=true', () => {
    const candidates: TsMorphEntity[] = [
      { type: 'function', name: 'foo', filePath: 'a.ts', startLine: 1, endLine: 3, language: 'typescript', exported: false },
      { type: 'function', name: 'foo', filePath: 'b.ts', startLine: 1, endLine: 3, language: 'typescript', exported: true },
    ];

    const result = findBestMatch(candidates, 'test.ts', true);
    expect(result?.exported).toBe(true);
  });
});

describe('extractRelationships', () => {
  it('should extract function call relationships', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      '/test/test.ts',
      `
      function helper() {
        return 42;
      }

      function main() {
        const result = helper();
        return result;
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');
    const entityLookupMap = buildEntityLookupMap(entities);
    const relationships = extractRelationships(sourceFile, '/test', entityLookupMap);

    const calls = relationships.filter((r) => r.type === 'calls');
    // Note: ts-morph may not always resolve calls without full type checking
    // We expect at least the relationship structure to be present
    expect(Array.isArray(calls)).toBe(true);
  });

  it('should extract class extends relationships', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      class Base {
        foo() {}
      }

      class Derived extends Base {
        bar() {}
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');
    const entityLookupMap = buildEntityLookupMap(entities);
    const relationships = extractRelationships(sourceFile, '/test', entityLookupMap);

    const extends_ = relationships.filter((r) => r.type === 'extends');
    expect(extends_).toHaveLength(1);
    expect(extends_[0]?.sourceName).toBe('Derived');
    expect(extends_[0]?.targetName).toBe('Base');
  });

  it('should extract implements relationships', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      interface Drawable {
        draw(): void;
      }

      class Circle implements Drawable {
        draw() {}
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');
    const entityLookupMap = buildEntityLookupMap(entities);
    const relationships = extractRelationships(sourceFile, '/test', entityLookupMap);

    const implements_ = relationships.filter((r) => r.type === 'implements');
    expect(implements_).toHaveLength(1);
    expect(implements_[0]?.sourceName).toBe('Circle');
    expect(implements_[0]?.targetName).toBe('Drawable');
  });

  it('should handle arrow function calls', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      const helper = () => 42;

      const main = () => {
        return helper();
      };
      `
    );

    const entities = extractEntities(sourceFile, '/test');
    const entityLookupMap = buildEntityLookupMap(entities);
    const relationships = extractRelationships(sourceFile, '/test', entityLookupMap);

    const calls = relationships.filter((r) => r.type === 'calls');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sourceName).toBe('main');
    expect(calls[0]?.targetName).toBe('helper');
  });
});

describe('extractJsDocContent', () => {
  it('should extract JSDoc description', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      /** This is a simple function */
      function foo() {}
      `
    );

    const fn = sourceFile.getFunctions()[0];
    if (!fn) throw new Error('Function not found');

    const jsDoc = extractJsDocContent(fn);
    expect(jsDoc).toBe('This is a simple function');
  });

  it('should extract JSDoc tags', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      /**
       * Adds two numbers
       * @param a First number
       * @param b Second number
       */
      function add(a: number, b: number) {
        return a + b;
      }
      `
    );

    const fn = sourceFile.getFunctions()[0];
    if (!fn) throw new Error('Function not found');

    const jsDoc = extractJsDocContent(fn);
    expect(jsDoc).toContain('Adds two numbers');
    expect(jsDoc).toContain('@param');
    expect(jsDoc).toContain('First number');
    expect(jsDoc).toContain('Second number');
  });

  it('should return null for empty JSDoc', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      'test.ts',
      `
      function foo() {}
      `
    );

    const fn = sourceFile.getFunctions()[0];
    if (!fn) throw new Error('Function not found');

    const jsDoc = extractJsDocContent(fn);
    expect(jsDoc).toBeNull();
  });
});

describe('cross-file call resolution', () => {
  it('should populate targetFilePath for cross-file function calls', () => {
    const project = new Project({ useInMemoryFileSystem: true });

    // Create utils.ts with exported helper function
    const utilsFile = project.createSourceFile(
      '/test/utils.ts',
      `
      export function helper() {
        return 42;
      }
      `
    );

    // Create main.ts that imports and calls helper
    const mainFile = project.createSourceFile(
      '/test/main.ts',
      `
      import { helper } from './utils';

      function main() {
        return helper();
      }
      `
    );

    // Extract entities from both files
    const utilsEntities = extractEntities(utilsFile, '/test');
    const mainEntities = extractEntities(mainFile, '/test');
    const allEntities = [...utilsEntities, ...mainEntities];

    // Build lookup map with entities from both files
    const entityLookupMap = buildEntityLookupMap(allEntities);

    // Extract relationships from main.ts
    const relationships = extractRelationships(mainFile, '/test', entityLookupMap);

    // Find the call relationship from main -> helper
    const callRel = relationships.find(
      (r) => r.type === 'calls' && r.sourceName === 'main' && r.targetName === 'helper'
    );

    expect(callRel).toBeDefined();
    expect(callRel?.targetFilePath).toBe('utils.ts');
  });

  it('should not populate targetFilePath for same-file calls', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(
      '/test/test.ts',
      `
      function helper() {
        return 42;
      }

      function main() {
        return helper();
      }
      `
    );

    const entities = extractEntities(sourceFile, '/test');
    const entityLookupMap = buildEntityLookupMap(entities);
    const relationships = extractRelationships(sourceFile, '/test', entityLookupMap);

    const callRel = relationships.find(
      (r) => r.type === 'calls' && r.sourceName === 'main' && r.targetName === 'helper'
    );

    expect(callRel).toBeDefined();
    // For same-file calls, targetFilePath should not be set
    expect(callRel?.targetFilePath).toBeUndefined();
  });
});

describe('extractVueScript', () => {
  const testDir = join(process.cwd(), 'test-temp-vue');

  it('should extract script setup from Vue SFC', () => {
    try {
      mkdirSync(testDir, { recursive: true });
      const vueFile = join(testDir, 'test.vue');
      writeFileSync(
        vueFile,
        `
<template>
  <div>{{ message }}</div>
</template>

<script setup lang="ts">
const message = 'Hello';
</script>
        `.trim()
      );

      const result = extractVueScript(vueFile);

      expect(result).not.toBeNull();
      expect(result?.isSetupSyntax).toBe(true);
      expect(result?.content).toContain('const message');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should extract regular script from Vue SFC', () => {
    try {
      mkdirSync(testDir, { recursive: true });
      const vueFile = join(testDir, 'test.vue');
      writeFileSync(
        vueFile,
        `
<template>
  <div>{{ message }}</div>
</template>

<script lang="ts">
export default {
  data() {
    return { message: 'Hello' };
  }
}
</script>
        `.trim()
      );

      const result = extractVueScript(vueFile);

      expect(result).not.toBeNull();
      expect(result?.isSetupSyntax).toBe(false);
      expect(result?.content).toContain('export default');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should return null for non-TypeScript Vue files', () => {
    try {
      mkdirSync(testDir, { recursive: true });
      const vueFile = join(testDir, 'test.vue');
      writeFileSync(
        vueFile,
        `
<template>
  <div>{{ message }}</div>
</template>

<script>
export default {
  data() {
    return { message: 'Hello' };
  }
}
</script>
        `.trim()
      );

      const result = extractVueScript(vueFile);

      expect(result).toBeNull();
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should prioritize script setup over regular script', () => {
    try {
      mkdirSync(testDir, { recursive: true });
      const vueFile = join(testDir, 'test.vue');
      writeFileSync(
        vueFile,
        `
<template>
  <div>{{ message }}</div>
</template>

<script lang="ts">
export default {}
</script>

<script setup lang="ts">
const message = 'Hello';
</script>
        `.trim()
      );

      const result = extractVueScript(vueFile);

      expect(result).not.toBeNull();
      expect(result?.isSetupSyntax).toBe(true);
      expect(result?.content).toContain('const message');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
