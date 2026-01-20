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
  DirectoryParser,
  getSupportedLanguages,
  detectLanguage,
  getLanguageConfig,
} from './parser/index.js';
export type {
  ParseResult,
  ParseError,
  ParseOutcome,
  SupportedLanguage,
  DirectoryParseOptions,
  DirectoryParseResult,
  FileParseResult,
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
  createFileStore,
  createIncrementalUpdater,
  computeFileHash,
  computeFileHashFromPath,
} from './db/index.js';
export type {
  DatabaseOptions,
  Entity,
  NewEntity,
  EntityType,
  EntityStore,
  RecentFile,
  Relationship,
  NewRelationship,
  RelationshipType,
  RelationshipStore,
  Migration,
  MigrationRunner,
  FileRecord,
  FileStore,
  IncrementalUpdater,
  IncrementalUpdateResult,
} from './db/index.js';

// Graph exports
export { FileProcessor } from './graph/index.js';
export type { ProcessFileOptions, ProcessFileResult } from './graph/index.js';

// Checkpoint exports
export {
  getCheckpointDb,
  closeCheckpointDb,
  createWorkflow,
  getWorkflow,
  findWorkflowByIssue,
  listWorkflows,
  setWorkflowPhase,
  setWorkflowStatus,
  deleteWorkflow,
  logAction,
  getActions,
  logCommit,
  getCommits,
  getWorkflowSummary,
} from './checkpoint/index.js';
export type {
  WorkflowStatus,
  WorkflowPhase,
  Workflow,
  WorkflowAction,
  WorkflowCommit,
  NewWorkflow,
  WorkflowSummary,
} from './checkpoint/index.js';

// Query exports
export { whatCalls, whatDoesCall, blastRadius } from './queries/index.js';
export type { AffectedEntity, BlastRadiusResult } from './queries/index.js';
