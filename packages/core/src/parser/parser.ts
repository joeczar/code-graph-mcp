import Parser, { type Tree } from 'tree-sitter';
import { readFileSync } from 'node:fs';
import {
  type SupportedLanguage,
  getLanguageConfig,
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

export class CodeParser {
  private parser: Parser;
  private loadedLanguages = new Map<SupportedLanguage, Parser.Language>();

  constructor() {
    this.parser = new Parser();
  }

  private getLanguage(language: SupportedLanguage): Parser.Language {
    const cached = this.loadedLanguages.get(language);
    if (cached) {
      return cached;
    }

    const config = getLanguageConfig(language);
    if (!config) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const grammar = config.loadGrammar();
    this.loadedLanguages.set(language, grammar);
    return grammar;
  }

  parse(code: string, language: SupportedLanguage): ParseOutcome {
    try {
      const grammar = this.getLanguage(language);
      this.parser.setLanguage(grammar);
      const tree = this.parser.parse(code);

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

  parseFile(filePath: string): ParseOutcome {
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

    // Read file separately to provide specific error messages
    let code: string;
    try {
      code = readFileSync(filePath, 'utf-8');
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

    // Parse the file
    try {
      const grammar = this.getLanguage(language);
      this.parser.setLanguage(grammar);
      const tree = this.parser.parse(code);

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
