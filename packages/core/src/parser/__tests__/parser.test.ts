import { describe, it, expect, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodeParser, detectLanguage, getSupportedLanguages } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('CodeParser', () => {
  let parser: CodeParser;

  beforeEach(() => {
    parser = new CodeParser();
  });

  describe('getSupportedLanguages', () => {
    it('returns typescript and ruby', () => {
      const languages = parser.getSupportedLanguages();
      expect(languages).toContain('typescript');
      expect(languages).toContain('ruby');
    });
  });

  describe('parse TypeScript', () => {
    it('parses TypeScript code successfully', () => {
      const code = 'function hello() { return "world"; }';
      const result = parser.parse(code, 'typescript');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.tree.rootNode).toBeDefined();
        expect(result.result.language).toBe('typescript');
        expect(result.result.sourceCode).toBe(code);
      }
    });

    it('extracts function declarations', () => {
      const code = `
        function greet(name: string): string {
          return "Hello, " + name;
        }
      `;
      const result = parser.parse(code, 'typescript');

      expect(result.success).toBe(true);
      if (result.success) {
        const root = result.result.tree.rootNode;
        const functions = root.descendantsOfType('function_declaration');
        expect(functions.length).toBe(1);
        expect(functions[0]?.childForFieldName('name')?.text).toBe('greet');
      }
    });

    it('extracts class declarations', () => {
      const code = `
        class Calculator {
          add(a: number, b: number): number {
            return a + b;
          }
        }
      `;
      const result = parser.parse(code, 'typescript');

      expect(result.success).toBe(true);
      if (result.success) {
        const root = result.result.tree.rootNode;
        const classes = root.descendantsOfType('class_declaration');
        expect(classes.length).toBe(1);
        expect(classes[0]?.childForFieldName('name')?.text).toBe('Calculator');
      }
    });
  });

  describe('parse Ruby', () => {
    it('parses Ruby code successfully', () => {
      const code = 'def hello; "world"; end';
      const result = parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.tree.rootNode).toBeDefined();
        expect(result.result.language).toBe('ruby');
      }
    });

    it('extracts method definitions', () => {
      const code = `
        def greet(name)
          "Hello, #{name}!"
        end
      `;
      const result = parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (result.success) {
        const root = result.result.tree.rootNode;
        const methods = root.descendantsOfType('method');
        expect(methods.length).toBe(1);
        expect(methods[0]?.childForFieldName('name')?.text).toBe('greet');
      }
    });

    it('extracts class definitions', () => {
      const code = `
        class Calculator
          def add(a, b)
            a + b
          end
        end
      `;
      const result = parser.parse(code, 'ruby');

      expect(result.success).toBe(true);
      if (result.success) {
        const root = result.result.tree.rootNode;
        const classes = root.descendantsOfType('class');
        expect(classes.length).toBeGreaterThanOrEqual(1);
        const calculator = classes.find(
          (c) => c.childForFieldName('name')?.text === 'Calculator'
        );
        expect(calculator).toBeDefined();
      }
    });
  });

  describe('parseFile', () => {
    it('parses TypeScript file', () => {
      const filePath = join(fixturesDir, 'sample.ts');
      const result = parser.parseFile(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.language).toBe('typescript');
        expect(result.result.filePath).toBe(filePath);

        const root = result.result.tree.rootNode;
        const functions = root.descendantsOfType('function_declaration');
        expect(functions.length).toBeGreaterThan(0);
      }
    });

    it('parses Ruby file', () => {
      const filePath = join(fixturesDir, 'sample.rb');
      const result = parser.parseFile(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.language).toBe('ruby');
        expect(result.result.filePath).toBe(filePath);

        const root = result.result.tree.rootNode;
        const methods = root.descendantsOfType('method');
        expect(methods.length).toBeGreaterThan(0);
      }
    });

    it('returns error for unsupported file type', () => {
      const result = parser.parseFile('test.unknown');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Cannot detect language');
      }
    });

    it('returns error for non-existent file', () => {
      const result = parser.parseFile('/nonexistent/path/file.ts');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('File not found');
        expect(result.error.filePath).toBe('/nonexistent/path/file.ts');
      }
    });
  });

  describe('handles syntax errors gracefully', () => {
    it('parses code with syntax errors without throwing', () => {
      const brokenCode = 'function { broken syntax';
      const result = parser.parse(brokenCode, 'typescript');

      // Tree-sitter still produces a tree, just with error nodes
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.tree.rootNode.hasError).toBe(true);
      }
    });
  });
});

describe('detectLanguage', () => {
  it('detects TypeScript files', () => {
    expect(detectLanguage('file.ts')).toBe('typescript');
    expect(detectLanguage('file.tsx')).toBe('typescript');
  });

  it('detects Ruby files', () => {
    expect(detectLanguage('file.rb')).toBe('ruby');
  });

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('file.py')).toBeNull();
    expect(detectLanguage('file.unknown')).toBeNull();
  });
});

describe('getSupportedLanguages', () => {
  it('returns array of supported languages', () => {
    const languages = getSupportedLanguages();
    expect(Array.isArray(languages)).toBe(true);
    expect(languages).toContain('typescript');
    expect(languages).toContain('ruby');
  });
});
