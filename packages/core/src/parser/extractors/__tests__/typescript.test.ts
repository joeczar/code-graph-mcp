import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptExtractor } from '../typescript.js';
import { CodeParser } from '../../parser.js';

describe('TypeScriptExtractor', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  describe('function extraction', () => {
    it('extracts function declarations', async () => {
      const code = `
        function greet(name: string): string {
          return "Hello, " + name;
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        type: 'function',
        name: 'greet',
        filePath: '/test/file.ts',
        language: 'typescript',
      });
      expect(entities[0]?.metadata).toMatchObject({
        parameters: ['name'],
        exported: false,
        async: false,
      });
    });

    it('extracts exported functions', async () => {
      const code = `
        export function calculate(x: number): number {
          return x * 2;
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]?.metadata?.['exported']).toBe(true);
    });

    it('extracts async functions', async () => {
      const code = `
        async function fetchData(): Promise<string> {
          return "data";
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]?.metadata?.['async']).toBe(true);
    });

    it('extracts arrow functions', async () => {
      const code = `
        const add = (a: number, b: number): number => {
          return a + b;
        };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        type: 'function',
        name: 'add',
      });
      expect(entities[0]?.metadata?.['arrowFunction']).toBe(true);
    });

    it('extracts exported arrow functions', async () => {
      const code = `
        export const multiply = (x: number): number => x * 2;
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]?.metadata?.['exported']).toBe(true);
      expect(entities[0]?.metadata?.['arrowFunction']).toBe(true);
    });
  });

  describe('class extraction', () => {
    it('extracts class declarations', async () => {
      const code = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      // Should have class + method
      expect(entities.length).toBeGreaterThanOrEqual(1);

      const classEntity = entities.find((e) => e.type === 'class');
      expect(classEntity).toBeDefined();
      expect(classEntity?.name).toBe('Calculator');
    });

    it('extracts class methods', async () => {
      const code = `
        class Math {
          multiply(x: number, y: number): number {
            return x * y;
          }

          divide(x: number, y: number): number {
            return x / y;
          }
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const methods = entities.filter((e) => e.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods[0]?.name).toBe('Math.multiply');
      expect(methods[1]?.name).toBe('Math.divide');
    });

    it('extracts static methods', async () => {
      const code = `
        class Utils {
          static isEven(n: number): boolean {
            return n % 2 === 0;
          }
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const method = entities.find((e) => e.type === 'method');
      expect(method?.metadata?.['static']).toBe(true);
    });

    it('extracts exported classes', async () => {
      const code = `
        export class Service {
          run(): void {}
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const classEntity = entities.find((e) => e.type === 'class');
      expect(classEntity?.metadata?.['exported']).toBe(true);
    });

    it('extracts generic classes', async () => {
      const code = `
        class Container<T> {
          value: T;
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const classEntity = entities.find((e) => e.type === 'class');
      expect(classEntity?.metadata?.['typeParameters']).toEqual(['T']);
    });
  });

  describe('type extraction', () => {
    it('extracts type aliases', async () => {
      const code = `
        type User = {
          name: string;
          age: number;
        };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        type: 'type',
        name: 'User',
      });
    });

    it('extracts exported type aliases', async () => {
      const code = `
        export type Config = {
          port: number;
        };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities[0]?.metadata?.['exported']).toBe(true);
    });

    it('extracts generic types', async () => {
      const code = `
        type Result<T, E> = { ok: T } | { err: E };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities[0]?.metadata?.['typeParameters']).toEqual(['T', 'E']);
    });
  });

  describe('interface extraction', () => {
    it('extracts interface declarations', async () => {
      const code = `
        interface Person {
          name: string;
          greet(): void;
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({
        type: 'type',
        name: 'Person',
      });
      expect(entities[0]?.metadata?.['interface']).toBe(true);
    });

    it('extracts exported interfaces', async () => {
      const code = `
        export interface Options {
          verbose: boolean;
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities[0]?.metadata?.['exported']).toBe(true);
    });

    it('extracts generic interfaces', async () => {
      const code = `
        interface Collection<T> {
          items: T[];
        }
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities[0]?.metadata?.['typeParameters']).toEqual(['T']);
    });
  });

  describe('entity structure', () => {
    it('includes correct line numbers', async () => {
      const code = `
function first() {
  return 1;
}

function second() {
  return 2;
}
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities[0]?.startLine).toBe(2);
      expect(entities[0]?.endLine).toBe(4);
      expect(entities[1]?.startLine).toBe(6);
      expect(entities[1]?.endLine).toBe(8);
    });

    it('includes file path and language', async () => {
      const code = 'function test() {}';

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/src/index.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities[0]).toMatchObject({
        filePath: '/src/index.ts',
        language: 'typescript',
      });
    });
  });

  describe('named exports', () => {
    it('detects named exports for functions', async () => {
      const code = `
        function foo() {}
        function bar() {}
        export { foo };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const foo = entities.find((e) => e.name === 'foo');
      const bar = entities.find((e) => e.name === 'bar');

      expect(foo?.metadata?.['exported']).toBe(true);
      expect(bar?.metadata?.['exported']).toBe(false);
    });

    it('detects named exports for classes', async () => {
      const code = `
        class MyClass {}
        export { MyClass };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const myClass = entities.find((e) => e.name === 'MyClass');
      expect(myClass?.metadata?.['exported']).toBe(true);
    });

    it('detects named exports for types and interfaces', async () => {
      const code = `
        type MyType = string;
        interface MyInterface {}
        export { MyType, MyInterface };
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      const myType = entities.find((e) => e.name === 'MyType');
      const myInterface = entities.find((e) => e.name === 'MyInterface');

      expect(myType?.metadata?.['exported']).toBe(true);
      expect(myInterface?.metadata?.['exported']).toBe(true);
    });

    it('detects default exports', async () => {
      const code = `
        export default function main() {}
      `;

      const result = await parser.parse(code, 'typescript');
      if (!result.success) {
        throw new Error('Parse failed');
      }

      const extractor = new TypeScriptExtractor({
        filePath: '/test/file.ts',
        sourceCode: code,
      });

      const entities = extractor.extract(result.result.tree.rootNode);

      expect(entities).toHaveLength(1);
      expect(entities[0]?.metadata?.['exported']).toBe(true);
    });
  });
});
