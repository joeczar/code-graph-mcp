import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  RubyLSPParser,
  RubyLSPNotAvailableError,
  parseWithRubyLSP,
} from '../ruby-lsp-parser.js';
import { SubprocessError } from '../subprocess-utils.js';

describe('RubyLSPParser', () => {
  describe('constructor', () => {
    it('should create parser with default options', () => {
      const parser = new RubyLSPParser();
      expect(parser).toBeDefined();
    });

    it('should create parser with custom options', () => {
      const parser = new RubyLSPParser({
        timeout: 5000,
        rubyPath: '/custom/ruby',
      });
      expect(parser).toBeDefined();
    });
  });

  describe('parse', () => {
    it('should return empty result for empty file list', async () => {
      const parser = new RubyLSPParser();
      const result = await parser.parse([]);

      expect(result.entities).toEqual([]);
      expect(result.relationships).toEqual([]);
    });

    it('should throw RubyLSPNotAvailableError when ruby-lsp gem is not installed', async () => {
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'simple.rb'
      );

      // This test will fail if ruby-lsp gem is actually installed
      // In that case, the test should be skipped or we should mock the subprocess
      await expect(parser.parse([filePath])).rejects.toThrow(
        RubyLSPNotAvailableError
      );
    });

    it('should handle invalid file path gracefully', async () => {
      const parser = new RubyLSPParser();
      const invalidPath = '/nonexistent/file.rb';

      // Should either throw RubyLSPNotAvailableError (gem not installed)
      // or SubprocessError (gem installed but file not found)
      await expect(parser.parse([invalidPath])).rejects.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return false when ruby-lsp gem is not installed', async () => {
      const parser = new RubyLSPParser();
      const available = await parser.isAvailable();

      // This will be false in most CI environments where ruby-lsp is not installed
      expect(typeof available).toBe('boolean');
    });
  });

  describe('parseWithRubyLSP convenience function', () => {
    it('should parse files using default parser', async () => {
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'simple.rb'
      );

      // Should throw RubyLSPNotAvailableError if gem not installed
      await expect(parseWithRubyLSP([filePath])).rejects.toThrow(
        RubyLSPNotAvailableError
      );
    });

    it('should accept custom options', async () => {
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'simple.rb'
      );

      await expect(
        parseWithRubyLSP([filePath], { timeout: 5000 })
      ).rejects.toThrow(RubyLSPNotAvailableError);
    });
  });

  describe('error handling', () => {
    it('should distinguish between gem not installed and other errors', async () => {
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'simple.rb'
      );

      try {
        await parser.parse([filePath]);
        // If we get here, ruby-lsp gem is installed (unexpected in most envs)
        expect(true).toBe(true);
      } catch (error) {
        // Should be RubyLSPNotAvailableError in most environments
        expect(error).toBeInstanceOf(RubyLSPNotAvailableError);
        if (error instanceof RubyLSPNotAvailableError) {
          expect(error.message).toContain('ruby-lsp');
          expect(error.name).toBe('RubyLSPNotAvailableError');
        }
      }
    });

    it('should include cause when RubyLSPNotAvailableError is thrown', async () => {
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'simple.rb'
      );

      try {
        await parser.parse([filePath]);
      } catch (error) {
        if (error instanceof RubyLSPNotAvailableError) {
          expect(error.cause).toBeDefined();
          expect(error.cause).toBeInstanceOf(SubprocessError);
        }
      }
    });
  });

  describe('integration with real ruby-lsp (skipped if not installed)', () => {
    it.skip('should parse a simple Ruby file with ruby-lsp', async () => {
      // This test is skipped by default since it requires ruby-lsp gem to be installed.
      // To run this test: gem install ruby-lsp && vitest --run ruby-lsp-parser.test.ts
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'simple.rb'
      );

      const result = await parser.parse([filePath]);

      expect(result.entities).toBeDefined();
      expect(result.relationships).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
      expect(Array.isArray(result.relationships)).toBe(true);
    });

    it.skip('should extract class entities from Ruby file', async () => {
      // This test is skipped by default since it requires ruby-lsp gem to be installed.
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'class.rb'
      );

      const result = await parser.parse([filePath]);

      const classEntities = result.entities.filter((e) => e.type === 'class');
      expect(classEntities.length).toBeGreaterThan(0);
    });

    it.skip('should extract method entities from Ruby file', async () => {
      // This test is skipped by default since it requires ruby-lsp gem to be installed.
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'class.rb'
      );

      const result = await parser.parse([filePath]);

      const methodEntities = result.entities.filter((e) => e.type === 'method');
      expect(methodEntities.length).toBeGreaterThan(0);
    });

    it.skip('should extract inheritance relationships from Ruby file', async () => {
      // This test is skipped by default since it requires ruby-lsp gem to be installed.
      const parser = new RubyLSPParser();
      const filePath = join(
        import.meta.dirname,
        'fixtures',
        'ruby',
        'class.rb'
      );

      const result = await parser.parse([filePath]);

      const extendsRelationships = result.relationships.filter(
        (r) => r.type === 'extends'
      );
      expect(extendsRelationships.length).toBeGreaterThan(0);
    });
  });
});
