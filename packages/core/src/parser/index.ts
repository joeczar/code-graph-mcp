export { CodeParser } from './parser.js';
export type { ParseResult, ParseError, ParseOutcome } from './parser.js';
export type { SupportedLanguage } from './languages.js';
export {
  getSupportedLanguages,
  detectLanguage,
  getLanguageConfig,
} from './languages.js';
export { Walker, WalkControl } from './walker.js';
export type {
  WalkerContext,
  EnterCallback,
  ExitCallback,
  Visitor,
  WalkOptions,
} from './walker.js';
export { TypeScriptExtractor } from './extractors/typescript.js';
export type { TypeScriptExtractorOptions } from './extractors/typescript.js';
export { TypeScriptRelationshipExtractor } from './extractors/typescript-relationships.js';
export type {
  ExtractedRelationship,
  ExtractedRelationshipType,
} from './extractors/typescript-relationships.js';
export { RubyExtractor } from './extractors/ruby.js';
export type { RubyExtractorOptions } from './extractors/ruby.js';
export { RubyRelationshipExtractor } from './extractors/ruby-relationships.js';
export { VueExtractor } from './extractors/vue.js';
export type { VueExtractorOptions } from './extractors/vue.js';
export { VueRelationshipExtractor } from './extractors/vue-relationships.js';
export { DirectoryParser } from './directory-parser.js';
export type {
  DirectoryParseOptions,
  DirectoryParseResult,
  FileParseResult,
} from './directory-parser.js';

// ts-morph parser exports
export { parseProject } from './ts-morph-project-parser.js';
export type {
  ProjectParseOptions,
  ProjectParseResult,
  ProgressCallback,
  FailedFile,
} from './ts-morph-project-parser.js';
export {
  extractEntities,
  extractRelationships,
  extractImportMap,
  extractVueScript,
  extractJsDocContent,
  buildEntityLookupMap,
  findBestMatch,
} from './ts-morph-parser.js';
export type {
  TsMorphEntity,
  TsMorphRelationship,
} from './ts-morph-parser.js';
