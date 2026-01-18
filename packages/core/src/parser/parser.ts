import { Parser, type Language, type Tree } from 'web-tree-sitter';
import { readFile } from 'node:fs/promises';
import {
  type SupportedLanguage,
  loadLanguage,
  detectLanguage,
  getSupportedLanguages,
} from './languages.js';

export interface ParseResult {
  tree: Tree;
  language: SupportedLanguage;
  filePath: string | null;
  sourceCode: string;
}

export interface ParseError {
  message: string;
  filePath?: string;
}

export type ParseOutcome =
  | { success: true; result: ParseResult }
  | { success: false; error: ParseError };

let parserInitialized = false;

export class CodeParser {
  private parser: Parser | null = null;
  private loadedLanguages = new Map<SupportedLanguage, Language>();

  private async ensureInitialized(): Promise<Parser> {
    if (!parserInitialized) {
      await Parser.init();
      parserInitialized = true;
    }
    if (!this.parser) {
      this.parser = new Parser();
    }
    return this.parser;
  }

  private async getLanguage(language: SupportedLanguage): Promise<Language> {
    const cached = this.loadedLanguages.get(language);
    if (cached) {
      return cached;
    }

    const grammar = await loadLanguage(language);
    this.loadedLanguages.set(language, grammar);
    return grammar;
  }

  async parse(code: string, language: SupportedLanguage): Promise<ParseOutcome> {
    try {
      const parser = await this.ensureInitialized();
      const grammar = await this.getLanguage(language);
      parser.setLanguage(grammar);
      const tree = parser.parse(code);

      if (!tree) {
        return {
          success: false,
          error: { message: 'Failed to parse code' },
        };
      }

      return {
        success: true,
        result: {
          tree,
          language,
          filePath: null,
          sourceCode: code,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          message: err instanceof Error ? err.message : 'Unknown parse error',
        },
      };
    }
  }

  async parseFile(filePath: string): Promise<ParseOutcome> {
    const language = detectLanguage(filePath);
    if (!language) {
      return {
        success: false,
        error: {
          message: `Cannot detect language for file: ${filePath}`,
          filePath,
        },
      };
    }

    let code: string;
    try {
      code = await readFile(filePath, 'utf-8');
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      let message: string;
      if (nodeErr.code === 'ENOENT') {
        message = `File not found: ${filePath}`;
      } else if (nodeErr.code === 'EACCES') {
        message = `Permission denied: ${filePath}`;
      } else if (nodeErr.code === 'EISDIR') {
        message = `Path is a directory: ${filePath}`;
      } else {
        message = `Failed to read file: ${nodeErr.message}`;
      }
      return { success: false, error: { message, filePath } };
    }

    try {
      const parser = await this.ensureInitialized();
      const grammar = await this.getLanguage(language);
      parser.setLanguage(grammar);
      const tree = parser.parse(code);

      if (!tree) {
        return {
          success: false,
          error: { message: 'Failed to parse code', filePath },
        };
      }

      return {
        success: true,
        result: {
          tree,
          language,
          filePath,
          sourceCode: code,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: {
          message: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          filePath,
        },
      };
    }
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return getSupportedLanguages();
  }
}
