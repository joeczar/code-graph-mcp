import type Parser from 'tree-sitter';

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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tsGrammar = require('tree-sitter-typescript') as {
        typescript: Parser.Language;
      };
      return tsGrammar.typescript;
    },
  },
  ruby: {
    name: 'ruby',
    extensions: ['.rb'],
    loadGrammar: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('tree-sitter-ruby') as Parser.Language;
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
