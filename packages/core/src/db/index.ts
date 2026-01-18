export { getDatabase, closeDatabase, resetDatabase } from './connection.js';
export type { DatabaseOptions } from './connection.js';

export { initializeSchema } from './schema.js';

export { createEntityStore } from './entities.js';
export type { Entity, NewEntity, EntityType, EntityStore } from './entities.js';

export { createRelationshipStore } from './relationships.js';
export type {
  Relationship,
  NewRelationship,
  RelationshipType,
  RelationshipStore,
} from './relationships.js';

export { createMigrationRunner, migrations } from './migrations.js';
export type { Migration, MigrationRunner } from './migrations.js';
