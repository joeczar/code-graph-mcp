import { Language } from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';

const require = createRequire(import.meta.url);

export type SupportedLanguage = 'typescript' | 'tsx' | 'ruby';

interface LanguageConfig {
  name: SupportedLanguage;
  extensions: string[];
  wasmFile: string;
}

const languageConfigs: Record<SupportedLanguage, LanguageConfig> = {
  typescript: {
    name: 'typescript',
    extensions: ['.ts'],
    wasmFile: 'tree-sitter-typescript.wasm',
  },
  tsx: {
    name: 'tsx',
    extensions: ['.tsx'],
    wasmFile: 'tree-sitter-tsx.wasm',
  },
  ruby: {
    name: 'ruby',
    extensions: ['.rb'],
    wasmFile: 'tree-sitter-ruby.wasm',
  },
};

function getWasmPath(wasmFile: string): string {
  const wasmsPath = dirname(require.resolve('@repomix/tree-sitter-wasms/package.json'));
  return join(wasmsPath, 'out', wasmFile);
}

export async function loadLanguage(
  language: SupportedLanguage
): Promise<Language> {
  const config = languageConfigs[language];
  const wasmPath = getWasmPath(config.wasmFile);
  try {
    return await Language.load(wasmPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(
      `Failed to load ${language} grammar from ${wasmPath}: ${message}`
    );
  }
}

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
