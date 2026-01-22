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
  parseProject,
  extractEntities,
  extractRelationships,
  extractImportMap,
  extractVueScript,
  extractJsDocContent,
  buildEntityLookupMap,
  findBestMatch,
} from './parser/index.js';
export type {
  ParseResult,
  ParseError,
  ParseOutcome,
  SupportedLanguage,
  DirectoryParseOptions,
  DirectoryParseResult,
  FileParseResult,
  ProjectParseOptions,
  ProjectParseResult,
  ProgressCallback,
  FailedFile,
  TsMorphEntity,
  TsMorphRelationship,
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
  createMetricsStore,
} from './db/index.js';
export type {
  DatabaseOptions,
  Entity,
  NewEntity,
  EntityType,
  EntityStore,
  RecentFile,
  EntityQuery,
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
  ToolCall,
  ParseStats,
  MetricsStore,
  ToolCallSummary,
  ParseStatsSummary,
  ToolUsageRanking,
} from './db/index.js';

// Graph exports
export { FileProcessor, TsMorphFileProcessor } from './graph/index.js';
export type { ProcessFileOptions, ProcessFileResult, ProcessProjectOptions, ProcessProjectResult } from './graph/index.js';

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
  setWorkflowPr,
  setWorkflowMerged,
  setWorkflowPrState,
  // Parse task operations
  createParseTask,
  getParseTask,
  listParseTasks,
  setParseTaskStatus,
  updateParseTaskProgress,
  deleteParseTask,
} from './checkpoint/index.js';
export type {
  WorkflowStatus,
  WorkflowPhase,
  PrState,
  Workflow,
  WorkflowAction,
  WorkflowCommit,
  NewWorkflow,
  WorkflowSummary,
  ParseTaskStatus,
  ParseTask,
  NewParseTask,
} from './checkpoint/index.js';

// Task exports
export {
  createProgressLogger,
  getDefaultLogDir,
  getLogPath,
} from './tasks/index.js';
export type {
  ProgressLogger,
  ParsePhase,
  ParseWorkerConfig,
} from './tasks/index.js';

// Query exports
export {
  findRelatedEntities,
  whatCalls,
  whatDoesCall,
  blastRadius,
  getExports,
} from './queries/index.js';
export type {
  RelationDirection,
  AffectedEntity,
  BlastRadiusResult,
  ExportType,
  ExportedEntity,
  GetExportsResult,
} from './queries/index.js';
