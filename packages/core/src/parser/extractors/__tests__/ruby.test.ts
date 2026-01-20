import { describe, it, expect, beforeEach } from 'vitest';
import type { NewEntity } from '../../../db/entities.js';
import { CodeParser } from '../../parser.js';
import { RubyExtractor } from '../ruby.js';

describe('RubyExtractor', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  /**
   * Helper to parse Ruby code and extract entities.
   * Reduces test boilerplate.
   */
  async function extractEntities(code: string): Promise<NewEntity[]> {
    const parseResult = await parser.parse(code, 'ruby');
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) throw new Error('Parse failed');

    const extractor = new RubyExtractor({ filePath: '/test/file.rb' });
    return extractor.extract(parseResult.result.tree.rootNode);
  }

  describe('method extraction', () => {
    it('extracts regular method definitions', async () => {
      const code = `
        def greet(name)
          "Hello, #{name}!"
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('greet');
      expect(methods[0]?.type).toBe('method');
      expect(methods[0]?.language).toBe('ruby');
      expect(methods[0]?.filePath).toBe('/test/file.rb');
      expect(methods[0]?.metadata).toEqual({
        methodName: 'greet',
        parameters: ['name'],
        methodType: 'instance',
      });
    });

    it('extracts singleton methods (class methods)', async () => {
      const code = `
        def self.helper
          "helper"
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('helper');
      expect(methods[0]?.metadata).toEqual({
        methodName: 'helper',
        parameters: [],
        methodType: 'class',
      });
    });

    it('extracts methods with multiple parameters', async () => {
      const code = `
        def calculate(x, y, z)
          x + y + z
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.metadata).toEqual({
        methodName: 'calculate',
        parameters: ['x', 'y', 'z'],
        methodType: 'instance',
      });
    });

    it('extracts methods with no parameters', async () => {
      const code = `
        def get_value
          42
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('get_value');
      expect(methods[0]?.metadata).toEqual({
        methodName: 'get_value',
        parameters: [],
        methodType: 'instance',
      });
    });

    it('extracts methods with optional parameters (default values)', async () => {
      const code = `
        def foo(bar = 1)
          bar * 2
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('foo');
      expect(methods[0]?.metadata).toEqual({
        parameters: ['bar = 1'],
        methodType: 'instance',
      });
    });

    it('extracts methods with keyword parameters', async () => {
      const code = `
        def foo(bar:, baz: 1)
          bar + baz
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('foo');
      expect(methods[0]?.metadata).toEqual({
        parameters: ['bar:', 'baz: 1'],
        methodType: 'instance',
      });
    });

    it('extracts methods with splat parameters', async () => {
      const code = `
        def foo(*args)
          args.sum
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('foo');
      expect(methods[0]?.metadata).toEqual({
        parameters: ['*args'],
        methodType: 'instance',
      });
    });

    it('extracts methods with hash splat parameters', async () => {
      const code = `
        def foo(**kwargs)
          kwargs.keys
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('foo');
      expect(methods[0]?.metadata).toEqual({
        parameters: ['**kwargs'],
        methodType: 'instance',
      });
    });

    it('extracts methods with block parameters', async () => {
      const code = `
        def foo(&block)
          block.call
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('foo');
      expect(methods[0]?.metadata).toEqual({
        parameters: ['&block'],
        methodType: 'instance',
      });
    });

    it('extracts methods with mixed advanced parameter types', async () => {
      const code = `
        def foo(a, b = 2, *args, c:, d: 3, **kwargs, &block)
          block.call(a, b, args, c, d, kwargs)
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('foo');
      expect(methods[0]?.metadata).toEqual({
        parameters: ['a', 'b = 2', '*args', 'c:', 'd: 3', '**kwargs', '&block'],
        methodType: 'instance',
      });
    });
  });

  describe('class extraction', () => {
    it('extracts class definitions', async () => {
      const code = `
        class Calculator
          def add(a, b)
            a + b
          end
        end
      `;

      const entities = await extractEntities(code);
      const classes = entities.filter((e) => e.type === 'class');

      expect(classes).toHaveLength(1);
      expect(classes[0]?.name).toBe('Calculator');
      expect(classes[0]?.type).toBe('class');
      expect(classes[0]?.language).toBe('ruby');
      expect(classes[0]?.metadata).toBeUndefined();
    });

    it('extracts class with superclass', async () => {
      const code = `
        class Dog < Animal
          def bark
            "Woof!"
          end
        end
      `;

      const entities = await extractEntities(code);
      const classes = entities.filter((e) => e.type === 'class');

      expect(classes).toHaveLength(1);
      expect(classes[0]?.name).toBe('Dog');
      expect(classes[0]?.metadata).toEqual({
        superclass: 'Animal',
      });
    });

    it('extracts methods inside classes', async () => {
      const code = `
        class Calculator
          def add(a, b)
            a + b
          end

          def multiply(a, b)
            a * b
          end
        end
      `;

      const entities = await extractEntities(code);
      const classes = entities.filter((e) => e.type === 'class');
      const methods = entities.filter((e) => e.type === 'method');

      expect(classes).toHaveLength(1);
      expect(classes[0]?.name).toBe('Calculator');

      expect(methods).toHaveLength(2);
      expect(methods[0]?.name).toBe('Calculator#add');
      expect(methods[0]?.metadata).toEqual({
        methodName: 'add',
        context: 'Calculator',
        parameters: ['a', 'b'],
        methodType: 'instance',
      });
      expect(methods[1]?.name).toBe('Calculator#multiply');
      expect(methods[1]?.metadata).toEqual({
        methodName: 'multiply',
        context: 'Calculator',
        parameters: ['a', 'b'],
        methodType: 'instance',
      });
    });
  });

  describe('module extraction', () => {
    it('extracts module definitions', async () => {
      const code = `
        module MyModule
          def self.helper
            "helper"
          end
        end
      `;

      const entities = await extractEntities(code);
      const modules = entities.filter((e) => e.type === 'module');

      expect(modules).toHaveLength(1);
      expect(modules[0]?.name).toBe('MyModule');
      expect(modules[0]?.type).toBe('module');
      expect(modules[0]?.language).toBe('ruby');
    });

    it('extracts methods inside modules', async () => {
      const code = `
        module Helpers
          def self.utility
            "util"
          end

          def instance_method
            "instance"
          end
        end
      `;

      const entities = await extractEntities(code);
      const modules = entities.filter((e) => e.type === 'module');
      const methods = entities.filter((e) => e.type === 'method');

      expect(modules).toHaveLength(1);
      expect(modules[0]?.name).toBe('Helpers');

      expect(methods).toHaveLength(2);
      expect(methods.some((m) => m.name === 'Helpers.utility')).toBe(true);
      expect(methods.some((m) => m.name === 'Helpers#instance_method')).toBe(true);
    });
  });

  describe('nested structures', () => {
    it('extracts class inside module', async () => {
      const code = `
        module Namespace
          class Calculator
            def add(a, b)
              a + b
            end
          end
        end
      `;

      const entities = await extractEntities(code);
      const modules = entities.filter((e) => e.type === 'module');
      const classes = entities.filter((e) => e.type === 'class');
      const methods = entities.filter((e) => e.type === 'method');

      expect(modules).toHaveLength(1);
      expect(modules[0]?.name).toBe('Namespace');

      expect(classes).toHaveLength(1);
      expect(classes[0]?.name).toBe('Calculator');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('Namespace::Calculator#add');
      expect(methods[0]?.metadata).toEqual({
        methodName: 'add',
        context: 'Namespace::Calculator',
        parameters: ['a', 'b'],
        methodType: 'instance',
      });
    });

    it('extracts multiple entities at same level', async () => {
      const code = `
        def standalone_method
          "standalone"
        end

        class FirstClass
          def method_one
            1
          end
        end

        class SecondClass
          def method_two
            2
          end
        end

        module MyModule
          def self.helper
            "help"
          end
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');
      const classes = entities.filter((e) => e.type === 'class');
      const modules = entities.filter((e) => e.type === 'module');

      expect(methods).toHaveLength(4); // standalone + method_one + method_two + helper
      expect(classes).toHaveLength(2); // FirstClass + SecondClass
      expect(modules).toHaveLength(1); // MyModule
    });

    it('extracts deeply nested structures', async () => {
      const code = `
        module Outer
          module Middle
            class Inner
              def instance_method
                "nested"
              end

              def self.class_method
                "class"
              end
            end
          end
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(2);
      expect(methods[0]?.name).toBe('Outer::Middle::Inner#instance_method');
      expect(methods[0]?.metadata).toEqual({
        methodName: 'instance_method',
        context: 'Outer::Middle::Inner',
        parameters: [],
        methodType: 'instance',
      });
      expect(methods[1]?.name).toBe('Outer::Middle::Inner.class_method');
      expect(methods[1]?.metadata).toEqual({
        methodName: 'class_method',
        context: 'Outer::Middle::Inner',
        parameters: [],
        methodType: 'class',
      });
    });
  });

  describe('line numbers', () => {
    it('captures correct start and end line numbers', async () => {
      const code = `def greet(name)
  "Hello, #{name}!"
end`;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.startLine).toBe(1);
      expect(methods[0]?.endLine).toBe(3);
    });
  });
});
