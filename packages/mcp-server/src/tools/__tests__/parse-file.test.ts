import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { resetDatabase } from '@code-graph/core';
import { parseFileTool } from '../parse-file.js';

// Path to fixtures in core package
const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '../../../../core/src/graph/__tests__/fixtures'
);

describe('parseFileTool', () => {
  beforeEach(() => {
    // Reset database before each test
    resetDatabase();
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parseFileTool.metadata.name).toBe('parse_file');
    });

    it('should have description mentioning parsing', () => {
      expect(parseFileTool.metadata.description.toLowerCase()).toContain('parse');
    });

    it('should validate path parameter', () => {
      const validResult = parseFileTool.metadata.inputSchema.safeParse({ path: '/test.ts' });
      expect(validResult.success).toBe(true);

      const invalidResult = parseFileTool.metadata.inputSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('handler', () => {
    describe('successful parsing', () => {
      it('should parse a TypeScript file', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        expect(response.content).toHaveLength(1);

        const text = response.content[0]?.text ?? '';
        expect(text).toContain('File Parsed Successfully');
        expect(text).toContain('sample.ts');
        expect(text).toContain('Language: typescript');
        expect(text).toContain('Entities');
        expect(text).toContain('function');
        expect(text).toContain('class');
      });

      it('should parse a Ruby file', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.rb');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        expect(response.content).toHaveLength(1);

        const text = response.content[0]?.text ?? '';
        expect(text).toContain('File Parsed Successfully');
        expect(text).toContain('Language: ruby');
        expect(text).toContain('class');
        expect(text).toContain('method');
        expect(text).toContain('module');
      });

      it('should extract relationships', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Relationships');
        // AdvancedCalculator extends Calculator
        expect(text).toContain('extends');
        // File contains entities
        expect(text).toContain('contains');
      });

      it('should handle relative paths', async () => {
        // Get relative path from cwd
        const absolutePath = path.join(FIXTURES_DIR, 'sample.ts');
        const relativePath = path.relative(process.cwd(), absolutePath);

        const response = await parseFileTool.handler({ path: relativePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('File Parsed Successfully');
      });

      it('should include file hash in response', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toMatch(/Hash: [a-f0-9]{8}\.\.\./);
      });
    });

    describe('idempotency', () => {
      it('should handle re-parsing the same file', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');

        // Parse twice
        const response1 = await parseFileTool.handler({ path: filePath });
        const response2 = await parseFileTool.handler({ path: filePath });

        expect(response1.isError).toBeUndefined();
        expect(response2.isError).toBeUndefined();

        // Both should succeed (idempotent operation)
        const text1 = response1.content[0]?.text ?? '';
        const text2 = response2.content[0]?.text ?? '';
        expect(text1).toContain('File Parsed Successfully');
        expect(text2).toContain('File Parsed Successfully');
      });
    });

    describe('error handling', () => {
      it('should return error for non-existent file', async () => {
        const response = await parseFileTool.handler({ path: '/nonexistent/file.ts' });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('File not found');
      });

      it('should return error for directory path', async () => {
        const response = await parseFileTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('not a file');
      });

      it('should return error for unsupported file type', async () => {
        // Create a temp file with unsupported extension
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-file-test-'));
        const tempFile = path.join(tempDir, 'test.xyz');
        fs.writeFileSync(tempFile, 'some content');

        try {
          const response = await parseFileTool.handler({ path: tempFile });

          expect(response.isError).toBe(true);
          const text = response.content[0]?.text ?? '';
          // Error message indicates language detection failed
          expect(text.toLowerCase()).toContain('cannot detect language');
        } finally {
          // Cleanup
          fs.unlinkSync(tempFile);
          fs.rmdirSync(tempDir);
        }
      });
    });

    describe('entity extraction', () => {
      it('should extract functions from TypeScript', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('function:');
      });

      it('should extract classes from TypeScript', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('class:');
      });

      it('should extract methods from TypeScript classes', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('method:');
      });

      it('should extract modules from Ruby', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.rb');
        const response = await parseFileTool.handler({ path: filePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('module:');
      });
    });
  });
});
