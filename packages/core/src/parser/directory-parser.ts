import { existsSync, statSync } from 'node:fs';
import { globby } from 'globby';
import { CodeParser, type ParseResult } from './parser.js';
import { getSupportedLanguages, getLanguageConfig } from './languages.js';

export interface DirectoryParseOptions {
  directory: string;
  extensions?: string[];
  ignorePatterns?: string[];
  onProgress?: (current: number, total: number, filePath: string) => void;
}

export interface FileParseResult {
  filePath: string;
  success: boolean;
  result?: ParseResult;
  error?: string;
}

export interface DirectoryParseResult {
  directory: string;
  totalFiles: number;
  successCount: number;
  errorCount: number;
  files: FileParseResult[];
}

export class DirectoryParser {
  private parser: CodeParser;

  constructor() {
    this.parser = new CodeParser();
  }

  private getDefaultExtensions(): string[] {
    const supportedLanguages = getSupportedLanguages();
    const extensions: string[] = [];
    for (const lang of supportedLanguages) {
      const config = getLanguageConfig(lang);
      if (config) {
        extensions.push(...config.extensions);
      }
    }
    return extensions;
  }

  async parseDirectory(
    options: DirectoryParseOptions
  ): Promise<DirectoryParseResult> {
    const {
      directory,
      extensions = this.getDefaultExtensions(),
      ignorePatterns = [],
      onProgress,
    } = options;

    // Validate directory exists
    if (!existsSync(directory)) {
      throw new Error(`Directory not found: ${directory}`);
    }

    const stats = statSync(directory);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${directory}`);
    }

    // Build glob patterns for supported extensions
    const patterns = extensions.map((ext) => `**/*${ext}`);

    // Find all matching files, respecting .gitignore
    let files: string[];
    try {
      files = await globby(patterns, {
        cwd: directory,
        absolute: true,
        gitignore: true,
        ignore: ignorePatterns,
      });
    } catch (error) {
      throw new Error(`Failed to scan directory ${directory}`, { cause: error });
    }

    const results: FileParseResult[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      if (!filePath) continue;

      if (onProgress) {
        onProgress(i + 1, files.length, filePath);
      }

      const outcome = await this.parser.parseFile(filePath);

      if (outcome.success) {
        results.push({
          filePath,
          success: true,
          result: outcome.result,
        });
        successCount++;
      } else {
        results.push({
          filePath,
          success: false,
          error: outcome.error.message,
        });
        errorCount++;
      }
    }

    return {
      directory,
      totalFiles: files.length,
      successCount,
      errorCount,
      files: results,
    };
  }
}
