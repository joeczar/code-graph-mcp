import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { resetDatabase } from '@code-graph/core';
import { parseDirectoryTool } from '../parse-directory.js';

// Path to fixtures in core package
const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '../../../../core/src/graph/__tests__/fixtures'
);

describe('parseDirectoryTool', () => {
  beforeEach(() => {
    // Reset database before each test
    resetDatabase();
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(parseDirectoryTool.metadata.name).toBe('parse_directory');
    });

    it('should have description mentioning parsing', () => {
      expect(parseDirectoryTool.metadata.description.toLowerCase()).toContain('parse');
    });

    it('should have description mentioning directory', () => {
      expect(parseDirectoryTool.metadata.description.toLowerCase()).toContain('directory');
    });

    it('should validate path parameter', () => {
      const validResult = parseDirectoryTool.metadata.inputSchema.safeParse({ path: '/test' });
      expect(validResult.success).toBe(true);
    });

    it('should require path parameter', () => {
      const invalidResult = parseDirectoryTool.metadata.inputSchema.safeParse({});
      expect(invalidResult.success).toBe(false);
    });

    it('should accept optional pattern parameter', () => {
      const validResult = parseDirectoryTool.metadata.inputSchema.safeParse({
        path: '/test',
        pattern: '**/*.ts'
      });
      expect(validResult.success).toBe(true);
    });
  });

  describe('handler', () => {
    describe('successful parsing', () => {
      it('should parse a directory with multiple files', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        expect(response.content).toHaveLength(1);

        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Directory Parsed Successfully');
        expect(text).toContain('Total Files:');
        expect(text).toContain('Successful:');
        expect(text).toContain('Entities');
        expect(text).toContain('Relationships');
      });

      it('should parse TypeScript and Ruby files', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should find at least 2 files (sample.ts and sample.rb)
        expect(text).toMatch(/Total Files:\s*[2-9]\d*/);
        expect(text).toMatch(/Successful:\s*[2-9]\d*/);
      });

      it('should filter files by pattern', async () => {
        const response = await parseDirectoryTool.handler({
          path: FIXTURES_DIR,
          pattern: '**/*.ts'
        });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should only find TypeScript files
        expect(text).toContain('Directory Parsed Successfully');
        // With pattern, we should get at least 1 file (sample.ts)
        expect(text).toMatch(/Total Files:\s*[1-9]\d*/);
      });

      it('should handle relative paths', async () => {
        // Get relative path from cwd
        const absolutePath = FIXTURES_DIR;
        const relativePath = path.relative(process.cwd(), absolutePath);

        const response = await parseDirectoryTool.handler({ path: relativePath });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Directory Parsed Successfully');
      });

      it('should extract entities from all files', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should have entities from both TypeScript and Ruby files
        expect(text).toContain('Entities');
        expect(text).toMatch(/function:|class:|method:|module:/);
      });

      it('should extract relationships from all files', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        expect(text).toContain('Relationships');
        expect(text).toMatch(/extends:|contains:/);
      });
    });

    describe('gitignore support', () => {
      let tempDir: string;

      beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-dir-test-'));
      });

      afterEach(() => {
        // Cleanup temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });
      });

      it('should respect .gitignore patterns', async () => {
        // Create test structure
        fs.writeFileSync(path.join(tempDir, 'included.ts'), 'export const x = 1;');
        fs.mkdirSync(path.join(tempDir, 'node_modules'));
        fs.writeFileSync(path.join(tempDir, 'node_modules', 'excluded.ts'), 'export const y = 2;');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), 'node_modules/');

        const response = await parseDirectoryTool.handler({ path: tempDir });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should find 1 file (included.ts), not the one in node_modules
        expect(text).toMatch(/Total Files:\s*1/);
        expect(text).toMatch(/Successful:\s*1/);
      });

      it('should ignore files in nested gitignore patterns', async () => {
        // Create test structure with nested directory
        fs.writeFileSync(path.join(tempDir, 'root.ts'), 'export const x = 1;');
        fs.mkdirSync(path.join(tempDir, 'dist'));
        fs.writeFileSync(path.join(tempDir, 'dist', 'excluded.ts'), 'export const y = 2;');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), 'dist/\n*.log');

        const response = await parseDirectoryTool.handler({ path: tempDir });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should only find root.ts
        expect(text).toMatch(/Total Files:\s*1/);
      });
    });

    describe('error handling', () => {
      it('should return error for non-existent directory', async () => {
        const response = await parseDirectoryTool.handler({ path: '/nonexistent/directory' });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Directory not found');
      });

      it('should return error for file path instead of directory', async () => {
        const filePath = path.join(FIXTURES_DIR, 'sample.ts');
        const response = await parseDirectoryTool.handler({ path: filePath });

        expect(response.isError).toBe(true);
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('not a directory');
      });

      it('should handle directory with no matching files', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-dir-empty-'));

        try {
          // Create directory with only non-supported files
          fs.writeFileSync(path.join(tempDir, 'test.txt'), 'some content');
          fs.writeFileSync(path.join(tempDir, 'README.md'), '# Readme');

          const response = await parseDirectoryTool.handler({ path: tempDir });

          expect(response.isError).toBeUndefined();
          const text = response.content[0]?.text ?? '';
          expect(text).toContain('Directory Parsed Successfully');
          expect(text).toMatch(/Total Files:\s*0/);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      });

      it('should handle individual file parse errors gracefully', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-dir-error-'));

        try {
          // Create a valid file and an invalid one
          fs.writeFileSync(path.join(tempDir, 'valid.ts'), 'export const x = 1;');
          fs.writeFileSync(path.join(tempDir, 'invalid.ts'), 'this is not valid typescript {{{{');

          const response = await parseDirectoryTool.handler({ path: tempDir });

          expect(response.isError).toBeUndefined();
          const text = response.content[0]?.text ?? '';
          expect(text).toContain('Directory Parsed Successfully');
          // Should show both successes and errors
          expect(text).toMatch(/Total Files:\s*2/);
          expect(text).toMatch(/Successful:\s*[12]/);
        } finally {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      });
    });

    describe('idempotency', () => {
      it('should handle re-parsing the same directory', async () => {
        // Parse twice (use force=true for first to ensure clean state in parallel tests)
        const response1 = await parseDirectoryTool.handler({ path: FIXTURES_DIR, force: true });
        const response2 = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response1.isError).toBeUndefined();
        expect(response2.isError).toBeUndefined();

        // First parse should succeed, second should return cached results (incremental update)
        const text1 = response1.content[0]?.text ?? '';
        const text2 = response2.content[0]?.text ?? '';
        expect(text1).toContain('Directory Parsed Successfully');
        // Second call returns cached results since files haven't changed
        expect(text2).toContain('Directory Already Indexed');
      });

      it('should reparse when force=true is used', async () => {
        // First parse
        await parseDirectoryTool.handler({ path: FIXTURES_DIR });
        // Force reparse
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR, force: true });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Directory Parsed Successfully');
      });
    });

    describe('summary output', () => {
      it('should include directory path in output', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';
        expect(text).toContain('Directory:');
        expect(text).toContain('fixtures');
      });

      it('should show entity type counts', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should list entity types with counts
        expect(text).toMatch(/class:\s*\d+/);
        expect(text).toMatch(/function:\s*\d+/);
        expect(text).toMatch(/method:\s*\d+/);
      });

      it('should show relationship type counts', async () => {
        const response = await parseDirectoryTool.handler({ path: FIXTURES_DIR });

        expect(response.isError).toBeUndefined();
        const text = response.content[0]?.text ?? '';

        // Should list relationship types with counts
        expect(text).toMatch(/extends:\s*\d+/);
        expect(text).toMatch(/contains:\s*\d+/);
      });
    });
  });
});
