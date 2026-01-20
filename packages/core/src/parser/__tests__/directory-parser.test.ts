import { describe, it, expect, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DirectoryParser } from '../directory-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const testProjectDir = join(fixturesDir, 'test-project');

describe('DirectoryParser', () => {
  let parser: DirectoryParser;

  beforeEach(() => {
    parser = new DirectoryParser();
  });

  describe('parseDirectory', () => {
    it('finds and parses all supported files recursively', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
      });

      expect(result.totalFiles).toBeGreaterThan(0);
      expect(result.successCount).toBeGreaterThan(0);
      expect(result.directory).toBe(testProjectDir);

      // Should find TypeScript, TSX, and Ruby files
      const extensions = result.files.map((f) => {
        const lastDot = f.filePath.lastIndexOf('.');
        return f.filePath.slice(lastDot);
      });
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.rb');
    });

    it('respects .gitignore patterns', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
      });

      // Should not include files in ignored/ directory
      const ignoredFiles = result.files.filter((f) =>
        f.filePath.includes('/ignored/')
      );
      expect(ignoredFiles.length).toBe(0);
    });

    it('filters by custom extensions', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
        extensions: ['.ts'], // Only TypeScript, not TSX or Ruby
      });

      const extensions = result.files.map((f) => {
        const lastDot = f.filePath.lastIndexOf('.');
        return f.filePath.slice(lastDot);
      });

      expect(extensions.every((ext) => ext === '.ts')).toBe(true);
      expect(extensions).not.toContain('.tsx');
      expect(extensions).not.toContain('.rb');
    });

    it('supports custom ignore patterns', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
        ignorePatterns: ['**/nested/**'],
      });

      // Should not include files in nested directory
      const nestedFiles = result.files.filter((f) =>
        f.filePath.includes('/nested/')
      );
      expect(nestedFiles.length).toBe(0);
    });

    it('tracks progress with callback', async () => {
      const progressUpdates: Array<{
        current: number;
        total: number;
        filePath: string;
      }> = [];

      await parser.parseDirectory({
        directory: testProjectDir,
        onProgress: (current, total, filePath) => {
          progressUpdates.push({ current, total, filePath });
        },
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]?.current).toBe(1);
      expect(progressUpdates[0]?.total).toBeGreaterThan(0);

      // Progress should increment
      if (progressUpdates.length > 1) {
        expect(progressUpdates[1]?.current).toBe(2);
      }
    });

    it('returns detailed results for each file', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
      });

      expect(result.files.length).toBeGreaterThan(0);

      // Check structure of successful file results
      const successfulFile = result.files.find((f) => f.success);
      expect(successfulFile).toBeDefined();
      if (successfulFile && successfulFile.success) {
        expect(successfulFile.filePath).toBeTruthy();
        expect(successfulFile.result).toBeDefined();
        expect(successfulFile.result?.tree).toBeDefined();
        expect(successfulFile.result?.language).toBeTruthy();
      }
    });

    it('counts successes and errors correctly', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
      });

      expect(result.totalFiles).toBe(result.files.length);
      expect(result.successCount + result.errorCount).toBeLessThanOrEqual(
        result.totalFiles
      );
      expect(result.successCount).toBeGreaterThan(0);
    });

    it('handles empty directories', async () => {
      const emptyDir = join(fixturesDir, 'empty-directory');
      const { mkdirSync, rmSync } = await import('node:fs');

      try {
        mkdirSync(emptyDir, { recursive: true });

        const result = await parser.parseDirectory({
          directory: emptyDir,
        });

        expect(result.totalFiles).toBe(0);
        expect(result.successCount).toBe(0);
        expect(result.errorCount).toBe(0);
        expect(result.files.length).toBe(0);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it('parses TypeScript files correctly', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
        extensions: ['.ts'],
      });

      const mainFile = result.files.find((f) => f.filePath.includes('main.ts'));
      expect(mainFile).toBeDefined();
      expect(mainFile?.success).toBe(true);

      if (mainFile && mainFile.success && mainFile.result) {
        expect(mainFile.result.language).toBe('typescript');
        expect(mainFile.result.tree.rootNode).toBeDefined();

        // Check for the main function
        const functions = mainFile.result.tree.rootNode.descendantsOfType(
          'function_declaration'
        );
        expect(functions.length).toBeGreaterThan(0);
      }
    });

    it('parses TSX files correctly', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
        extensions: ['.tsx'],
      });

      const componentFile = result.files.find((f) =>
        f.filePath.includes('component.tsx')
      );
      expect(componentFile).toBeDefined();
      expect(componentFile?.success).toBe(true);

      if (componentFile && componentFile.success && componentFile.result) {
        expect(componentFile.result.language).toBe('tsx');
        expect(componentFile.result.tree.rootNode).toBeDefined();
      }
    });

    it('parses Ruby files correctly', async () => {
      const result = await parser.parseDirectory({
        directory: testProjectDir,
        extensions: ['.rb'],
      });

      const rubyFile = result.files.find((f) => f.filePath.includes('.rb'));
      expect(rubyFile).toBeDefined();
      expect(rubyFile?.success).toBe(true);

      if (rubyFile && rubyFile.success && rubyFile.result) {
        expect(rubyFile.result.language).toBe('ruby');
        expect(rubyFile.result.tree.rootNode).toBeDefined();

        // Check for the greet method
        const methods = rubyFile.result.tree.rootNode.descendantsOfType('method');
        expect(methods.length).toBeGreaterThan(0);
      }
    });
  });
});
