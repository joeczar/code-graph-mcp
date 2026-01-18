import type Parser from 'tree-sitter';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type SupportedLanguage = 'typescript' | 'ruby';

interface LanguageConfig {
  name: SupportedLanguage;
  extensions: string[];
  loadGrammar: () => Parser.Language;
}

const languageConfigs: Record<SupportedLanguage, LanguageConfig> = {
  typescript: {
    name: 'typescript',
    extensions: ['.ts', '.tsx'],
    loadGrammar: () => {
      try {
        const tsGrammar = require('tree-sitter-typescript') as {
          typescript: Parser.Language;
        };
        return tsGrammar.typescript;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(
          `Failed to load TypeScript grammar. ` +
            `Ensure tree-sitter-typescript is installed: ${message}`
        );
      }
    },
  },
  ruby: {
    name: 'ruby',
    extensions: ['.rb'],
    loadGrammar: () => {
      try {
        return require('tree-sitter-ruby') as Parser.Language;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(
          `Failed to load Ruby grammar. ` +
            `Ensure tree-sitter-ruby is installed: ${message}`
        );
      }
    },
  },
};

export function getLanguageConfig(
  language: SupportedLanguage
): LanguageConfig | undefined {
  return languageConfigs[language];
}

export function getSupportedLanguages(): SupportedLanguage[] {
  return Object.keys(languageConfigs) as SupportedLanguage[];
}

export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  for (const [lang, config] of Object.entries(languageConfigs)) {
    if (config.extensions.includes(ext)) {
      return lang as SupportedLanguage;
    }
  }
  return null;
}
