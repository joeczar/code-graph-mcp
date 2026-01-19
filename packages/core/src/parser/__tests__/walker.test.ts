import { describe, it, expect, beforeEach } from 'vitest';
import { CodeParser } from '../parser.js';
import { Walker, WalkControl } from '../walker.js';
import type { Node } from 'web-tree-sitter';

describe('Walker', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  describe('basic traversal', () => {
    it('visits all nodes in depth-first order', async () => {
      const code = 'function hello() { return "world"; }';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const visited: string[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitAll({
        enter: (node) => {
          visited.push(node.type);
        },
      });
      walker.walk();

      // Should visit root and function declaration at minimum
      expect(visited).toContain('program');
      expect(visited).toContain('function_declaration');
    });

    it('calls enter and exit callbacks in correct order', async () => {
      const code = 'const x = 1;';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const events: string[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitAll({
        enter: (node) => {
          events.push(`enter:${node.type}`);
        },
        exit: (node) => {
          events.push(`exit:${node.type}`);
        },
      });
      walker.walk();

      // Each enter should have a matching exit
      const enters = events.filter((e) => e.startsWith('enter:'));
      const exits = events.filter((e) => e.startsWith('exit:'));
      expect(enters.length).toBe(exits.length);

      // Exit should come after enter for same node
      const programEnter = events.indexOf('enter:program');
      const programExit = events.indexOf('exit:program');
      expect(programExit).toBeGreaterThan(programEnter);
    });
  });

  describe('visitor pattern', () => {
    it('visits specific node types only', async () => {
      const code = `
        function greet(name: string): string {
          return "Hello, " + name;
        }
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const functions: Node[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitType('function_declaration', {
        enter: (node) => {
          functions.push(node);
        },
      });
      walker.walk();

      expect(functions.length).toBe(1);
      expect(functions[0]?.childForFieldName('name')?.text).toBe('greet');
    });

    it('supports multiple type-specific visitors', async () => {
      const code = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const classes: Node[] = [];
      const methods: Node[] = [];
      const walker = new Walker(result.result.tree);

      walker.visitType('class_declaration', {
        enter: (node) => {
          classes.push(node);
        },
      });

      walker.visitType('method_definition', {
        enter: (node) => {
          methods.push(node);
        },
      });

      walker.walk();

      expect(classes.length).toBe(1);
      expect(classes[0]?.childForFieldName('name')?.text).toBe('Calculator');
      expect(methods.length).toBe(1);
    });

    it('wildcard visitor is called for all nodes', async () => {
      const code = 'const x = 1;';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      let count = 0;
      const walker = new Walker(result.result.tree);
      walker.visitAll({
        enter: () => {
          count++;
        },
      });
      walker.walk();

      // Should visit multiple nodes
      expect(count).toBeGreaterThan(3);
    });
  });

  describe('context tracking', () => {
    it('provides correct depth information', async () => {
      const code = 'function f() { const x = 1; }';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const depths: number[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitAll({
        enter: (_node, ctx) => {
          depths.push(ctx.depth);
        },
      });
      walker.walk();

      // Root should be at depth 0
      expect(depths[0]).toBe(0);
      // Should have nodes at various depths
      expect(Math.max(...depths)).toBeGreaterThan(0);
    });

    it('tracks parent and ancestors', async () => {
      const code = 'function f() { const x = 1; }';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      let checkedAncestors = false;
      const walker = new Walker(result.result.tree);
      walker.visitType('lexical_declaration', {
        enter: (node, ctx) => {
          // lexical_declaration should have ancestors
          expect(ctx.parent).not.toBeNull();
          expect(ctx.ancestors.length).toBeGreaterThan(0);
          expect(ctx.ancestors[0]?.type).toBe('program');
          checkedAncestors = true;
        },
      });
      walker.walk();

      expect(checkedAncestors).toBe(true);
    });

    it('provides field name for named fields', async () => {
      const code = 'function greet(name: string) { return name; }';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      let foundNameField = false;
      const walker = new Walker(result.result.tree);
      walker.visitType('identifier', {
        enter: (node, ctx) => {
          if (ctx.fieldName === 'name' && node.text === 'greet') {
            foundNameField = true;
          }
        },
      });
      walker.walk();

      expect(foundNameField).toBe(true);
    });
  });

  describe('traversal control', () => {
    it('stops walking when WalkControl.Stop is returned', async () => {
      const code = `
        function a() {}
        function b() {}
        function c() {}
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const functions: Node[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitType('function_declaration', {
        enter: (node) => {
          functions.push(node);
          // Stop after first function
          return WalkControl.Stop;
        },
      });
      walker.walk();

      // Should only visit first function before stopping
      expect(functions.length).toBe(1);
    });

    it('skips subtree when WalkControl.SkipSubtree is returned', async () => {
      const code = `
        function outer() {
          function inner() {
            const x = 1;
          }
        }
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const functions: string[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitType('function_declaration', {
        enter: (node) => {
          const name = node.childForFieldName('name')?.text ?? 'anonymous';
          functions.push(name);
          // Skip children of outer function
          if (name === 'outer') {
            return WalkControl.SkipSubtree;
          }
          return WalkControl.Continue;
        },
      });
      walker.walk();

      // Should see outer but not inner
      expect(functions).toContain('outer');
      expect(functions).not.toContain('inner');
    });

    it('continues normally when WalkControl.Continue is returned', async () => {
      const code = 'function f() { function g() {} }';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const functions: Node[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitType('function_declaration', {
        enter: (node) => {
          functions.push(node);
          return WalkControl.Continue;
        },
      });
      walker.walk();

      // Should visit both functions
      expect(functions.length).toBe(2);
    });
  });

  describe('filtering', () => {
    it('filters by node types', async () => {
      const code = `
        class A {}
        function f() {}
        const x = 1;
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const visited: string[] = [];
      const walker = new Walker(result.result.tree, {
        nodeTypes: ['class_declaration', 'function_declaration'],
      });
      walker.visitAll({
        enter: (node) => {
          visited.push(node.type);
        },
      });
      walker.walk();

      expect(visited).toContain('class_declaration');
      expect(visited).toContain('function_declaration');
      expect(visited).not.toContain('lexical_declaration');
    });

    it('filters out anonymous nodes when namedOnly is true', async () => {
      const code = 'const x = 1;';
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const namedNodes: Node[] = [];
      const walker = new Walker(result.result.tree, { namedOnly: true });
      walker.visitAll({
        enter: (node) => {
          namedNodes.push(node);
        },
      });
      walker.walk();

      // All visited nodes should be named
      expect(namedNodes.every((n) => n.isNamed)).toBe(true);
    });
  });

  describe('convenience methods', () => {
    it('collect() gathers nodes of specified types', async () => {
      const code = `
        function a() {}
        function b() {}
        class C {}
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const walker = new Walker(result.result.tree);
      const functions = walker.collect(['function_declaration']);

      expect(functions.length).toBe(2);
      expect(functions.every((n) => n.type === 'function_declaration')).toBe(true);
    });

    it('collect() returns multiple node types', async () => {
      const code = `
        function f() {}
        class C {}
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      const walker = new Walker(result.result.tree);
      const declarations = walker.collect(['function_declaration', 'class_declaration']);

      expect(declarations.length).toBe(2);
      const types = declarations.map((n) => n.type);
      expect(types).toContain('function_declaration');
      expect(types).toContain('class_declaration');
    });
  });

  describe('practical usage', () => {
    it('extracts function names with metadata', async () => {
      const code = `
        function greet(name: string): string {
          return "Hello, " + name;
        }

        function add(a: number, b: number): number {
          return a + b;
        }
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      interface FunctionInfo {
        name: string;
        depth: number;
        paramCount: number;
      }

      const functions: FunctionInfo[] = [];
      const walker = new Walker(result.result.tree);
      walker.visitType('function_declaration', {
        enter: (node, ctx) => {
          const name = node.childForFieldName('name')?.text ?? 'anonymous';
          const params = node.childForFieldName('parameters');
          const paramCount = params?.namedChildCount ?? 0;

          functions.push({
            name,
            depth: ctx.depth,
            paramCount,
          });
        },
      });
      walker.walk();

      expect(functions).toHaveLength(2);
      expect(functions[0]?.name).toBe('greet');
      expect(functions[0]?.paramCount).toBe(1);
      expect(functions[1]?.name).toBe('add');
      expect(functions[1]?.paramCount).toBe(2);
    });

    it('extracts nested function structure', async () => {
      const code = `
        function outer(x: number) {
          function inner(y: number) {
            return x + y;
          }
          return inner;
        }
      `;
      const result = await parser.parse(code, 'typescript');
      expect(result.success).toBe(true);
      if (!result.success) return;

      interface FunctionInfo {
        name: string;
        depth: number;
        hasParams: boolean;
      }

      const functions: FunctionInfo[] = [];
      const walker = new Walker(result.result.tree);

      walker.visitType('function_declaration', {
        enter: (node, ctx) => {
          const name = node.childForFieldName('name')?.text ?? 'anonymous';
          const params = node.childForFieldName('parameters');
          const hasParams = (params?.namedChildCount ?? 0) > 0;

          functions.push({
            name,
            depth: ctx.depth,
            hasParams,
          });
        },
      });
      walker.walk();

      expect(functions).toHaveLength(2);

      const outer = functions.find((f) => f.name === 'outer');
      expect(outer).toBeDefined();
      expect(outer?.hasParams).toBe(true);

      const inner = functions.find((f) => f.name === 'inner');
      expect(inner).toBeDefined();
      expect(inner?.hasParams).toBe(true);
      expect(inner!.depth).toBeGreaterThan(outer!.depth);
    });
  });
});
