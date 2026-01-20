import { describe, it, expect, beforeEach } from 'vitest';
import { CodeParser } from '../../parser.js';
import { RubyRelationshipExtractor } from '../ruby-relationships.js';

describe('RubyRelationshipExtractor', () => {
  let parser: CodeParser;
  let extractor: RubyRelationshipExtractor;

  beforeEach(() => {
    parser = new CodeParser();
    extractor = new RubyRelationshipExtractor();
  });

  describe('require/require_relative extraction', () => {
    it('extracts require as imports relationship', async () => {
      const code = `
        require 'json'
        require 'pathname'
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const imports = relationships.filter(r => r.type === 'imports');

      expect(imports).toHaveLength(2);
      expect(imports[0]?.targetName).toBe('json');
      expect(imports[0]?.metadata?.['requireType']).toBe('require');
      expect(imports[1]?.targetName).toBe('pathname');
    });

    it('extracts require_relative as imports relationship', async () => {
      const code = `
        require_relative './helper'
        require_relative '../lib/utils'
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const imports = relationships.filter(r => r.type === 'imports');

      expect(imports).toHaveLength(2);
      expect(imports[0]?.targetName).toBe('./helper');
      expect(imports[0]?.metadata?.['requireType']).toBe('require_relative');
      expect(imports[1]?.targetName).toBe('../lib/utils');
    });

    it('tracks source context for requires within methods', async () => {
      const code = `
        def load_dependencies
          require 'json'
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const imports = relationships.filter(r => r.type === 'imports');

      expect(imports).toHaveLength(1);
      expect(imports[0]?.sourceName).toBe('load_dependencies');
    });
  });

  describe('method call extraction', () => {
    it('extracts method calls within methods', async () => {
      const code = `
        def greet
          puts "Hello"
          logger.info("Greeting")
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const calls = relationships.filter(r => r.type === 'calls');

      expect(calls).toHaveLength(2);

      const putsCall = calls.find(c => c.targetName === 'puts');
      expect(putsCall).toBeDefined();
      expect(putsCall?.sourceName).toBe('greet');

      const infoCall = calls.find(c => c.targetName === 'info');
      expect(infoCall).toBeDefined();
      expect(infoCall?.metadata?.['receiver']).toBe('logger');
    });

    it('extracts method calls within classes', async () => {
      const code = `
        class Calculator
          def compute
            add(1, 2)
            subtract(5, 3)
          end
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const calls = relationships.filter(r => r.type === 'calls');

      expect(calls).toHaveLength(2);

      const addCall = calls.find(c => c.targetName === 'add');
      expect(addCall).toBeDefined();
      expect(addCall?.sourceName).toBe('compute');
    });

    it('does not extract calls outside of named contexts', async () => {
      const code = `
        puts "Top level"
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const calls = relationships.filter(r => r.type === 'calls');

      // Top-level calls should be filtered out
      expect(calls).toHaveLength(0);
    });
  });

  describe('class inheritance extraction', () => {
    it('extracts class inheritance as extends relationship', async () => {
      const code = `
        class Dog < Animal
          def bark
            "woof"
          end
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const extends_ = relationships.filter(r => r.type === 'extends');

      expect(extends_).toHaveLength(1);
      expect(extends_[0]?.sourceName).toBe('Dog');
      expect(extends_[0]?.targetName).toBe('Animal');
    });

    it('does not extract extends for classes without superclass', async () => {
      const code = `
        class Standalone
          def method
          end
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const extends_ = relationships.filter(r => r.type === 'extends');

      expect(extends_).toHaveLength(0);
    });

    it('handles namespaced superclass names', async () => {
      const code = `
        class MyApp::Controller < ApplicationController
          def index
          end
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const extends_ = relationships.filter(r => r.type === 'extends');

      expect(extends_).toHaveLength(1);
      expect(extends_[0]?.targetName).toBe('ApplicationController');
    });
  });

  describe('module operations extraction', () => {
    it('extracts include as implements relationship', async () => {
      const code = `
        class MyClass
          include Enumerable
          include Comparable
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const implements_ = relationships.filter(r => r.type === 'implements');

      expect(implements_).toHaveLength(2);

      const enumerable = implements_.find(i => i.targetName === 'Enumerable');
      expect(enumerable).toBeDefined();
      expect(enumerable?.sourceName).toBe('MyClass');
      expect(enumerable?.metadata?.['operation']).toBe('include');

      const comparable = implements_.find(i => i.targetName === 'Comparable');
      expect(comparable).toBeDefined();
    });

    it('extracts extend as implements relationship', async () => {
      const code = `
        class MyClass
          extend ClassMethods
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const implements_ = relationships.filter(r => r.type === 'implements');

      expect(implements_).toHaveLength(1);
      expect(implements_[0]?.targetName).toBe('ClassMethods');
      expect(implements_[0]?.metadata?.['operation']).toBe('extend');
    });

    it('extracts prepend as implements relationship', async () => {
      const code = `
        class MyClass
          prepend Instrumentation
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const implements_ = relationships.filter(r => r.type === 'implements');

      expect(implements_).toHaveLength(1);
      expect(implements_[0]?.targetName).toBe('Instrumentation');
      expect(implements_[0]?.metadata?.['operation']).toBe('prepend');
    });

    it('handles multiple modules in one statement', async () => {
      const code = `
        class MyClass
          include ModuleA, ModuleB, ModuleC
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);
      const implements_ = relationships.filter(r => r.type === 'implements');

      expect(implements_).toHaveLength(3);
      expect(implements_.some(i => i.targetName === 'ModuleA')).toBe(true);
      expect(implements_.some(i => i.targetName === 'ModuleB')).toBe(true);
      expect(implements_.some(i => i.targetName === 'ModuleC')).toBe(true);
    });
  });

  describe('comprehensive integration', () => {
    it('extracts all relationship types from complex Ruby code', async () => {
      const code = `
        require 'json'
        require_relative './helper'

        class MyController < ApplicationController
          include Authentication
          extend ClassMethods

          def index
            load_data
            render json: data
          end

          def load_data
            @data = fetch_from_db
          end
        end
      `;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);

      const imports = relationships.filter(r => r.type === 'imports');
      const extends_ = relationships.filter(r => r.type === 'extends');
      const implements_ = relationships.filter(r => r.type === 'implements');
      const calls = relationships.filter(r => r.type === 'calls');

      // Verify all relationship types are present
      expect(imports).toHaveLength(2);
      expect(extends_).toHaveLength(1);
      expect(implements_).toHaveLength(2);
      // Note: Ruby bare method calls may be parsed as identifiers, not call nodes
      expect(calls.length).toBeGreaterThanOrEqual(1);

      // Verify specific relationships
      expect(imports.some(i => i.targetName === 'json')).toBe(true);
      expect(extends_[0]?.targetName).toBe('ApplicationController');
      expect(implements_.some(i => i.targetName === 'Authentication')).toBe(true);
    });
  });

  describe('source locations', () => {
    it('includes line and column information for relationships', async () => {
      const code = `require 'json'`;
      const result = await parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (!result.success) return;

      const relationships = extractor.extract(result.result.tree.rootNode, code);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]?.sourceLocation).toBeDefined();
      expect(relationships[0]?.sourceLocation?.line).toBeGreaterThan(0);
      expect(relationships[0]?.sourceLocation?.column).toBeGreaterThanOrEqual(0);
    });
  });
});
