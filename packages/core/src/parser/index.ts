export { CodeParser } from './parser.js';
export type { ParseResult, ParseError, ParseOutcome } from './parser.js';
export type { SupportedLanguage } from './languages.js';
export {
  getSupportedLanguages,
  detectLanguage,
  getLanguageConfig,
} from './languages.js';
export { createFileProcessor } from './file-processor.js';
export type {
  FileProcessor,
  FileProcessorOptions,
  ProcessFileResult,
} from './file-processor.js';
