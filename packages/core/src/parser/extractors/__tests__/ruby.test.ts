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
        methodName: 'foo',
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
        methodName: 'foo',
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
        methodName: 'foo',
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
        methodName: 'foo',
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
        methodName: 'foo',
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
        methodName: 'foo',
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

  describe('attribute accessors', () => {
    it('extracts attr_reader as getter method', async () => {
      const code = `
        class User
          attr_reader :name
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('User#name');
      expect(methods[0]?.type).toBe('method');
      expect(methods[0]?.metadata).toEqual({
        generatedBy: 'attr_reader',
        methodName: 'name',
        methodType: 'getter',
        context: 'User',
      });
    });

    it('extracts attr_writer as setter method', async () => {
      const code = `
        class User
          attr_writer :email
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(1);
      expect(methods[0]?.name).toBe('User#email=');
      expect(methods[0]?.type).toBe('method');
      expect(methods[0]?.metadata).toEqual({
        generatedBy: 'attr_writer',
        methodName: 'email=',
        methodType: 'setter',
        context: 'User',
      });
    });

    it('extracts attr_accessor as both getter and setter', async () => {
      const code = `
        class User
          attr_accessor :age
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(2);
      expect(methods[0]?.name).toBe('User#age');
      expect(methods[0]?.metadata).toEqual({
        generatedBy: 'attr_accessor',
        methodName: 'age',
        methodType: 'getter',
        context: 'User',
      });
      expect(methods[1]?.name).toBe('User#age=');
      expect(methods[1]?.metadata).toEqual({
        generatedBy: 'attr_accessor',
        methodName: 'age=',
        methodType: 'setter',
        context: 'User',
      });
    });

    it('extracts multiple symbols from single attr_reader', async () => {
      const code = `
        class Product
          attr_reader :id, :name, :price
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(3);
      expect(methods[0]?.name).toBe('Product#id');
      expect(methods[0]?.metadata?.['methodType']).toBe('getter');
      expect(methods[1]?.name).toBe('Product#name');
      expect(methods[1]?.metadata?.['methodType']).toBe('getter');
      expect(methods[2]?.name).toBe('Product#price');
      expect(methods[2]?.metadata?.['methodType']).toBe('getter');
    });

    it('extracts multiple symbols from single attr_writer', async () => {
      const code = `
        class Product
          attr_writer :a, :b, :c
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(3);
      expect(methods[0]?.name).toBe('Product#a=');
      expect(methods[0]?.metadata?.['methodType']).toBe('setter');
      expect(methods[1]?.name).toBe('Product#b=');
      expect(methods[1]?.metadata?.['methodType']).toBe('setter');
      expect(methods[2]?.name).toBe('Product#c=');
      expect(methods[2]?.metadata?.['methodType']).toBe('setter');
    });

    it('extracts multiple symbols from single attr_accessor', async () => {
      const code = `
        class Product
          attr_accessor :x, :y
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(4); // 2 getters + 2 setters
      expect(methods[0]?.name).toBe('Product#x');
      expect(methods[0]?.metadata?.['methodType']).toBe('getter');
      expect(methods[1]?.name).toBe('Product#x=');
      expect(methods[1]?.metadata?.['methodType']).toBe('setter');
      expect(methods[2]?.name).toBe('Product#y');
      expect(methods[2]?.metadata?.['methodType']).toBe('getter');
      expect(methods[3]?.name).toBe('Product#y=');
      expect(methods[3]?.metadata?.['methodType']).toBe('setter');
    });

    it('builds correct qualified names inside class context', async () => {
      const code = `
        class User
          attr_reader :username
          attr_writer :password
          attr_accessor :email
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(4);
      const methodNames = methods.map((m) => m.name);
      expect(methodNames).toContain('User#username');
      expect(methodNames).toContain('User#password=');
      expect(methodNames).toContain('User#email');
      expect(methodNames).toContain('User#email=');
    });

    it('extracts attribute accessors in nested module/class context', async () => {
      const code = `
        module API
          class Response
            attr_accessor :status
          end
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(2);
      expect(methods[0]?.name).toBe('API::Response#status');
      expect(methods[0]?.metadata).toEqual({
        generatedBy: 'attr_accessor',
        methodName: 'status',
        methodType: 'getter',
        context: 'API::Response',
      });
      expect(methods[1]?.name).toBe('API::Response#status=');
      expect(methods[1]?.metadata).toEqual({
        generatedBy: 'attr_accessor',
        methodName: 'status=',
        methodType: 'setter',
        context: 'API::Response',
      });
    });

    it('extracts mixed regular methods and attribute accessors', async () => {
      const code = `
        class Book
          attr_reader :title
          attr_accessor :author

          def initialize(title, author)
            @title = title
            @author = author
          end

          def description
            "#{@title} by #{@author}"
          end
        end
      `;

      const entities = await extractEntities(code);
      const methods = entities.filter((e) => e.type === 'method');

      expect(methods).toHaveLength(5);
      const methodNames = methods.map((m) => m.name);
      expect(methodNames).toContain('Book#title'); // attr_reader
      expect(methodNames).toContain('Book#author'); // attr_accessor getter
      expect(methodNames).toContain('Book#author='); // attr_accessor setter
      expect(methodNames).toContain('Book#initialize'); // regular method
      expect(methodNames).toContain('Book#description'); // regular method
    });
  });

  describe('constants', () => {
    it('extracts top-level constants with string values', async () => {
      const code = `
        API_VERSION = "2.0"
      `;

      const entities = await extractEntities(code);
      const constants = entities.filter((e) => e.type === 'variable');

      expect(constants).toHaveLength(1);
      expect(constants[0]?.name).toBe('API_VERSION');
      expect(constants[0]?.type).toBe('variable');
      expect(constants[0]?.language).toBe('ruby');
      expect(constants[0]?.filePath).toBe('/test/file.rb');
      expect(constants[0]?.metadata).toEqual({
        kind: 'constant',
        constantName: 'API_VERSION',
      });
    });

    it('extracts constants with different value types', async () => {
      const code = `
        MAX_COUNT = 100
        DEFAULT_NAME = "Unknown"
        ENABLED = true
        CONFIG = { key: 'value' }
        ITEMS = [1, 2, 3]
      `;

      const entities = await extractEntities(code);
      const constants = entities.filter((e) => e.type === 'variable');

      expect(constants).toHaveLength(5);
      expect(constants.map((c) => c.name)).toEqual([
        'MAX_COUNT',
        'DEFAULT_NAME',
        'ENABLED',
        'CONFIG',
        'ITEMS',
      ]);
    });

    it('extracts constants inside classes', async () => {
      const code = `
        class MyClass
          VERSION = "1.0"
          MAX_SIZE = 1000
        end
      `;

      const entities = await extractEntities(code);
      const constants = entities.filter((e) => e.type === 'variable');

      expect(constants).toHaveLength(2);
      expect(constants[0]?.name).toBe('MyClass::VERSION');
      expect(constants[0]?.metadata).toEqual({
        kind: 'constant',
        constantName: 'VERSION',
        context: 'MyClass',
      });
      expect(constants[1]?.name).toBe('MyClass::MAX_SIZE');
      expect(constants[1]?.metadata).toEqual({
        kind: 'constant',
        constantName: 'MAX_SIZE',
        context: 'MyClass',
      });
    });

    it('extracts constants inside modules', async () => {
      const code = `
        module MyModule
          TIMEOUT = 30
          RETRY_COUNT = 3
        end
      `;

      const entities = await extractEntities(code);
      const constants = entities.filter((e) => e.type === 'variable');

      expect(constants).toHaveLength(2);
      expect(constants[0]?.name).toBe('MyModule::TIMEOUT');
      expect(constants[0]?.metadata).toEqual({
        kind: 'constant',
        constantName: 'TIMEOUT',
        context: 'MyModule',
      });
      expect(constants[1]?.name).toBe('MyModule::RETRY_COUNT');
      expect(constants[1]?.metadata).toEqual({
        kind: 'constant',
        constantName: 'RETRY_COUNT',
        context: 'MyModule',
      });
    });

    it('extracts nested constants (module -> class -> constant)', async () => {
      const code = `
        module Outer
          module Middle
            class Inner
              API_KEY = "secret123"
            end
          end
        end
      `;

      const entities = await extractEntities(code);
      const constants = entities.filter((e) => e.type === 'variable');

      expect(constants).toHaveLength(1);
      expect(constants[0]?.name).toBe('Outer::Middle::Inner::API_KEY');
      expect(constants[0]?.metadata).toEqual({
        kind: 'constant',
        constantName: 'API_KEY',
        context: 'Outer::Middle::Inner',
      });
    });

    it('does not extract regular variable assignments', async () => {
      const code = `
        my_var = 42
        another_var = "hello"
      `;

      const entities = await extractEntities(code);
      const variables = entities.filter((e) => e.type === 'variable');

      // Regular variables (lowercase) should not be extracted
      expect(variables).toHaveLength(0);
    });

    it('extracts multiple constants at different nesting levels', async () => {
      const code = `
        TOP_LEVEL = "global"

        module MyModule
          MODULE_CONSTANT = 100

          class MyClass
            CLASS_CONSTANT = 200

            def method
              local_var = 300
            end
          end
        end
      `;

      const entities = await extractEntities(code);
      const constants = entities.filter((e) => e.type === 'variable');

      expect(constants).toHaveLength(3);
      expect(constants[0]?.name).toBe('TOP_LEVEL');
      expect(constants[1]?.name).toBe('MyModule::MODULE_CONSTANT');
      expect(constants[2]?.name).toBe('MyModule::MyClass::CLASS_CONSTANT');
    });
  });
});
