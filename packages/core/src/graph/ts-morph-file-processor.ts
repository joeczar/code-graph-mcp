import type Database from 'better-sqlite3';
import { type Entity, type NewEntity, createEntityStore } from '../db/entities.js';
import {
  type Relationship,
  type NewRelationship,
  createRelationshipStore,
} from '../db/relationships.js';
import { parseProject, type ProjectParseResult, type ProgressCallback, type FailedFile } from '../parser/ts-morph-project-parser.js';
import type { TsMorphEntity, TsMorphRelationship } from '../parser/ts-morph-parser.js';

/**
 * Relationship with entity names instead of database IDs.
 * Names are resolved to IDs during storage.
 *
 * Optional file path fields enable cross-file relationship resolution:
 * - When provided, allows database lookup for entities in other files
 * - When absent, falls back to local-only resolution (current file)
 */
type PendingRelationship = Omit<NewRelationship, 'sourceId' | 'targetId'> & {
  sourceName: string;
  targetName: string;
  /** File path where the target entity is defined (for cross-file resolution) */
  targetFilePath?: string;
  /** File path where the source entity is defined (for cross-file resolution) */
  sourceFilePath?: string;
};

/**
 * Converts a TsMorphRelationship to a pending relationship.
 * Preserves optional file path fields for cross-file resolution.
 */
function toPendingRelationship(rel: TsMorphRelationship): PendingRelationship {
  // Note: 'exports' relationships are filtered out before calling this function
  // Type assertion is safe because we validate the type at the call site
  return {
    sourceName: rel.sourceName,
    targetName: rel.targetName,
    type: rel.type as PendingRelationship['type'],
    ...(rel.metadata && { metadata: rel.metadata }),
    ...(rel.targetFilePath && { targetFilePath: rel.targetFilePath }),
    ...(rel.sourceFilePath && { sourceFilePath: rel.sourceFilePath }),
  };
}

/**
 * Converts a TsMorphEntity to a NewEntity.
 * Preserves exported flag and JSDoc in metadata.
 */
function toNewEntity(entity: TsMorphEntity): NewEntity {
  const metadata: Record<string, unknown> = {};

  if (entity.exported !== undefined) {
    metadata['exported'] = entity.exported;
  }

  if (entity.jsDocContent) {
    metadata['jsDocContent'] = entity.jsDocContent;
  }

  // Merge with existing metadata if present
  const finalMetadata = entity.metadata
    ? { ...entity.metadata, ...metadata }
    : metadata;

  return {
    type: entity.type,
    name: entity.name,
    filePath: entity.filePath,
    startLine: entity.startLine,
    endLine: entity.endLine,
    language: entity.language,
    ...(Object.keys(finalMetadata).length > 0 && { metadata: finalMetadata }),
  };
}

export interface ProcessProjectOptions {
  projectPath: string;
  db: Database.Database;
  exclude?: string[];
  /**
   * Optional progress callback for reporting parsing progress.
   * Called at each phase: scan, load, entities, relationships.
   */
  onProgress?: ProgressCallback;
}

export interface ProcessProjectResult {
  projectPath: string;
  entities: Entity[];
  relationships: Relationship[];
  success: boolean;
  error?: string;
  /** Files that failed to load or parse */
  failedFiles?: FailedFile[];
  stats?: {
    filesScanned: number;
    filesLoaded: number;
    vueFilesProcessed: number;
    entitiesByType: Record<string, number>;
    relationshipsByType: Record<string, number>;
  };
}

/**
 * TsMorphFileProcessor orchestrates parsing a TypeScript/JavaScript project
 * and storing the results in the database.
 *
 * Uses ts-morph for cross-file relationship resolution, enabling accurate
 * tracking of imports, function calls, and class relationships across files.
 */
export class TsMorphFileProcessor {
  /**
   * Process an entire TypeScript/JavaScript project: parse, extract entities/relationships, store in DB.
   */
  processProject(options: ProcessProjectOptions): ProcessProjectResult {
    const { projectPath, db, exclude, onProgress } = options;

    // Step 1: Parse project using ts-morph
    let parseResult: ProjectParseResult;
    try {
      parseResult = parseProject({
        projectPath,
        ...(exclude && { exclude }),
        ...(onProgress && { onProgress }),
      });
    } catch (error) {
      return {
        projectPath,
        entities: [],
        relationships: [],
        success: false,
        error: `Failed to parse project: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const { entities: tsMorphEntities, relationships: tsMorphRelationships, stats, failedFiles } = parseResult;

    // Step 2: Build entity file path map for relationship enrichment
    // Map entity names to their file paths (for adding sourceFilePath to relationships)
    const entityNameToFilePath = new Map<string, string>();
    for (const entity of tsMorphEntities) {
      entityNameToFilePath.set(entity.name, entity.filePath);
    }

    // Step 3: Convert TsMorph types to database types
    const entities = tsMorphEntities.map(toNewEntity);
    const relationships = tsMorphRelationships
      // Filter out 'exports' relationships - not supported in database schema
      .filter(rel => rel.type !== 'exports')
      .map(rel => {
        const pending = toPendingRelationship(rel);

        // Enrich with sourceFilePath if not already set
        if (!pending.sourceFilePath) {
          const sourceFilePath = entityNameToFilePath.get(rel.sourceName);
          if (sourceFilePath) {
            pending.sourceFilePath = sourceFilePath;
          }
        }

        // Enrich with targetFilePath if not already set
        if (!pending.targetFilePath) {
          const targetFilePath = entityNameToFilePath.get(rel.targetName);
          if (targetFilePath) {
            pending.targetFilePath = targetFilePath;
          }
        }

        return pending;
      });

    // Step 4: Store in database using batch operations for performance
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    let storedEntities: Entity[] = [];
    let storedRelationships: Relationship[] = [];

    try {
      // Wrap database operations in a transaction for atomicity
      const transaction = db.transaction(() => {
        // Pre-load existing entities into cache for O(1) cross-file lookups
        // This avoids expensive individual DB queries during relationship resolution
        const entityCache = new Map<string, Map<string, string>>();
        const existingEntities = entityStore.getAll();
        for (const entity of existingEntities) {
          let nameMap = entityCache.get(entity.filePath);
          if (!nameMap) {
            nameMap = new Map<string, string>();
            entityCache.set(entity.filePath, nameMap);
          }
          nameMap.set(entity.name, entity.id);
        }

        // Batch insert all entities
        storedEntities = entityStore.createBatch(entities);

        // Build file->name->id mapping for newly inserted entities
        // and add them to the cache for relationship resolution
        const nameCollisions: string[] = [];
        for (const entity of storedEntities) {
          let nameMap = entityCache.get(entity.filePath);
          if (!nameMap) {
            nameMap = new Map<string, string>();
            entityCache.set(entity.filePath, nameMap);
          }

          // Check for name collisions within the same file
          if (nameMap.has(entity.name)) {
            nameCollisions.push(`${entity.filePath}:${entity.name}`);
          }

          nameMap.set(entity.name, entity.id);
        }

        // Log warning for name collisions (indicates potential data quality issues)
        if (nameCollisions.length > 0) {
          console.warn(
            `[TsMorphFileProcessor] Name collisions detected: ${nameCollisions.join(', ')}. ` +
            'Relationships may be incorrectly resolved.'
          );
        }

        // Resolve relationships using in-memory cache only
        // All lookups are O(1) - no DB queries needed
        const resolvedRelationships: NewRelationship[] = [];

        for (const rel of relationships) {
          let sourceId: string | undefined;
          let targetId: string | undefined;

          // Look up source and target IDs from cache
          if (rel.sourceFilePath) {
            sourceId = entityCache.get(rel.sourceFilePath)?.get(rel.sourceName);
          }
          if (rel.targetFilePath) {
            targetId = entityCache.get(rel.targetFilePath)?.get(rel.targetName);
          }

          // Skip relationships where we can't resolve both entities.
          // Common cases that are skipped:
          // - Calls to external functions/methods (e.g., console.log, Array.map)
          // - Imports from external modules (e.g., 'node:fs', 'react')
          // - References to undefined entities
          if (!sourceId || !targetId) {
            continue;
          }

          resolvedRelationships.push({
            sourceId,
            targetId,
            type: rel.type,
            ...(rel.metadata && { metadata: rel.metadata }),
          });
        }

        // Batch insert relationships with INSERT OR IGNORE
        // SQLite handles duplicate prevention - no need for manual dedup Set
        storedRelationships = relationshipStore.createBatch(resolvedRelationships);
      });

      transaction();
    } catch (error) {
      return {
        projectPath,
        entities: [],
        relationships: [],
        success: false,
        error: `Database transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      projectPath,
      entities: storedEntities,
      relationships: storedRelationships,
      success: true,
      failedFiles,
      stats,
    };
  }
}
