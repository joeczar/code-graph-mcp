import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptRelationshipExtractor } from '../typescript-relationships.js';
import { CodeParser } from '../../parser.js';

describe('TypeScriptRelationshipExtractor', () => {
  let parser: CodeParser;
  let extractor: TypeScriptRelationshipExtractor;

  beforeEach(() => {
    parser = new CodeParser();
    extractor = new TypeScriptRelationshipExtractor();
  });

  describe('import extraction', () => {
    it('extracts named imports', async () => {
      const code = `
        import { foo, bar } from './utils';
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const imports = relationships.filter(r => r.type === 'imports');

        expect(imports).toHaveLength(1);
        expect(imports[0]?.targetName).toBe('./utils');
        expect(imports[0]?.metadata?.['named']).toEqual(['foo', 'bar']);
      }
    });

    it('extracts default imports', async () => {
      const code = `
        import React from 'react';
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const imports = relationships.filter(r => r.type === 'imports');

        expect(imports).toHaveLength(1);
        expect(imports[0]?.targetName).toBe('react');
        expect(imports[0]?.metadata?.['default']).toBe('React');
      }
    });

    it('extracts namespace imports', async () => {
      const code = `
        import * as fs from 'node:fs';
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const imports = relationships.filter(r => r.type === 'imports');

        expect(imports).toHaveLength(1);
        expect(imports[0]?.targetName).toBe('node:fs');
        expect(imports[0]?.metadata?.['namespace']).toBe('fs');
      }
    });

    it('handles multiple imports from different modules', async () => {
      const code = `
        import { readFile } from 'node:fs/promises';
        import path from 'node:path';
        import * as util from 'node:util';
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const imports = relationships.filter(r => r.type === 'imports');

        expect(imports).toHaveLength(3);
        expect(imports.map(i => i.targetName)).toEqual([
          'node:fs/promises',
          'node:path',
          'node:util',
        ]);
      }
    });
  });

  describe('call extraction', () => {
    it('extracts function calls', async () => {
      const code = `
        function helper() {
          return 42;
        }

        function main() {
          const result = helper();
          return result;
        }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const calls = relationships.filter(r => r.type === 'calls');

        expect(calls).toHaveLength(1);
        expect(calls[0]?.sourceName).toBe('main');
        expect(calls[0]?.targetName).toBe('helper');
      }
    });

    it('extracts method calls', async () => {
      const code = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }

          calculate(): number {
            return this.add(1, 2);
          }
        }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const calls = relationships.filter(r => r.type === 'calls');

        expect(calls.length).toBeGreaterThan(0);
        const addCall = calls.find(c => c.targetName === 'add');
        expect(addCall).toBeDefined();
        expect(addCall?.sourceName).toBe('calculate');
      }
    });

    it('tracks nested function calls', async () => {
      const code = `
        function a() { return 1; }
        function b() { return a(); }
        function c() { return b(); }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const calls = relationships.filter(r => r.type === 'calls');

        expect(calls).toHaveLength(2);
        expect(calls.find(c => c.sourceName === 'b' && c.targetName === 'a')).toBeDefined();
        expect(calls.find(c => c.sourceName === 'c' && c.targetName === 'b')).toBeDefined();
      }
    });
  });

  describe('class inheritance (extends)', () => {
    it('extracts class extends relationship', async () => {
      const code = `
        class Animal {
          name: string;
        }

        class Dog extends Animal {
          bark(): void {}
        }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const extends_ = relationships.filter(r => r.type === 'extends');

        expect(extends_).toHaveLength(1);
        expect(extends_[0]?.sourceName).toBe('Dog');
        expect(extends_[0]?.targetName).toBe('Animal');
      }
    });

    it('extracts multiple inheritance levels', async () => {
      const code = `
        class A {}
        class B extends A {}
        class C extends B {}
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const extends_ = relationships.filter(r => r.type === 'extends');

        expect(extends_).toHaveLength(2);
        expect(extends_.find(e => e.sourceName === 'B' && e.targetName === 'A')).toBeDefined();
        expect(extends_.find(e => e.sourceName === 'C' && e.targetName === 'B')).toBeDefined();
      }
    });
  });

  describe('interface implementation', () => {
    it('extracts single interface implementation', async () => {
      const code = `
        interface Drawable {
          draw(): void;
        }

        class Circle implements Drawable {
          draw(): void {}
        }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const implements_ = relationships.filter(r => r.type === 'implements');

        expect(implements_).toHaveLength(1);
        expect(implements_[0]?.sourceName).toBe('Circle');
        expect(implements_[0]?.targetName).toBe('Drawable');
      }
    });

    it('extracts multiple interface implementations', async () => {
      const code = `
        interface Drawable {
          draw(): void;
        }

        interface Resizable {
          resize(width: number, height: number): void;
        }

        class Rectangle implements Drawable, Resizable {
          draw(): void {}
          resize(width: number, height: number): void {}
        }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const implements_ = relationships.filter(r => r.type === 'implements');

        expect(implements_).toHaveLength(2);
        expect(implements_.find(i => i.sourceName === 'Rectangle' && i.targetName === 'Drawable')).toBeDefined();
        expect(implements_.find(i => i.sourceName === 'Rectangle' && i.targetName === 'Resizable')).toBeDefined();
      }
    });

    it('handles class that both extends and implements', async () => {
      const code = `
        class Base {}

        interface Feature {
          feature(): void;
        }

        class Derived extends Base implements Feature {
          feature(): void {}
        }
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        const extends_ = relationships.filter(r => r.type === 'extends');
        const implements_ = relationships.filter(r => r.type === 'implements');

        expect(extends_).toHaveLength(1);
        expect(extends_[0]?.sourceName).toBe('Derived');
        expect(extends_[0]?.targetName).toBe('Base');

        expect(implements_).toHaveLength(1);
        expect(implements_[0]?.sourceName).toBe('Derived');
        expect(implements_[0]?.targetName).toBe('Feature');
      }
    });
  });

  describe('edge cases', () => {
    it('handles empty file', async () => {
      const code = '';
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        expect(relationships).toHaveLength(0);
      }
    });

    it('handles file with only comments', async () => {
      const code = `
        // This is a comment
        /* Multi-line
           comment */
      `;
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        const relationships = extractor.extract(parseResult.result);
        expect(relationships).toHaveLength(0);
      }
    });

    it('handles syntax errors gracefully', async () => {
      const code = 'class Broken extends {';
      const parseResult = await parser.parse(code, 'typescript');
      expect(parseResult.success).toBe(true);

      if (parseResult.success) {
        // Should not throw, but may extract partial relationships
        expect(() => extractor.extract(parseResult.result)).not.toThrow();
      }
    });
  });
});
