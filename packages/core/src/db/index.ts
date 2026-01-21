export { getDatabase, closeDatabase, resetDatabase } from './connection.js';
export type { DatabaseOptions } from './connection.js';

export { initializeSchema } from './schema.js';

export { createEntityStore } from './entities.js';
export type { Entity, NewEntity, EntityType, EntityStore, RecentFile, EntityQuery } from './entities.js';

export { createRelationshipStore } from './relationships.js';
export type {
  Relationship,
  NewRelationship,
  RelationshipType,
  RelationshipStore,
} from './relationships.js';

export { createMigrationRunner, migrations } from './migrations.js';
export type { Migration, MigrationRunner } from './migrations.js';

export { createFileStore } from './files.js';
export type { FileRecord, FileStore } from './files.js';

export {
  createIncrementalUpdater,
  computeFileHash,
  computeFileHashFromPath,
} from './incremental-updater.js';
export type {
  IncrementalUpdater,
  IncrementalUpdateResult,
} from './incremental-updater.js';

export { createMetricsStore } from './metrics.js';
export type {
  ToolCall,
  ParseStats,
  MetricsStore,
  ToolCallSummary,
  ParseStatsSummary,
  ToolUsageRanking,
} from './metrics.js';
