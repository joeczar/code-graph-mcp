/**
 * @code-graph/core
 *
 * Knowledge graph for code, documentation, and learnings.
 * Provides parsing, storage, and query capabilities.
 */

export const VERSION = '0.0.1';

// Parser exports
export {
  CodeParser,
  getSupportedLanguages,
  detectLanguage,
  getLanguageConfig,
} from './parser/index.js';
export type {
  ParseResult,
  ParseError,
  ParseOutcome,
  SupportedLanguage,
} from './parser/index.js';

// Database exports
export {
  getDatabase,
  closeDatabase,
  resetDatabase,
  initializeSchema,
  createEntityStore,
  createRelationshipStore,
  createMigrationRunner,
  migrations,
} from './db/index.js';
export type {
  DatabaseOptions,
  Entity,
  NewEntity,
  EntityType,
  EntityStore,
  Relationship,
  NewRelationship,
  RelationshipType,
  RelationshipStore,
  Migration,
  MigrationRunner,
} from './db/index.js';
