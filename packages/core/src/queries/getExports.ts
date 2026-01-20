import type { Entity, EntityStore } from '../db/entities.js';

/** Export type classification */
export type ExportType = 'default' | 'named';

/** An exported entity with its export metadata */
export interface ExportedEntity {
  /** The entity being exported */
  entity: Entity;
  /** How the entity is exported (default or named) */
  exportType: ExportType;
  /** Optional function/method signature from metadata */
  signature?: string;
}

/** Result of querying file exports */
export interface GetExportsResult {
  /** Absolute path to the file */
  filePath: string;
  /** All exported entities from the file */
  exports: ExportedEntity[];
  /** Total count of exports */
  totalCount: number;
}

/**
 * Get all exported entities from a file.
 *
 * Queries the entity store for all entities in the specified file that have
 * isExported metadata set to true. Returns them with their export type
 * and optional signature.
 *
 * @param filePath - Absolute path to the file to query
 * @param entityStore - The entity store to query
 * @returns Result containing all exports from the file
 */
export function getExports(
  filePath: string,
  entityStore: EntityStore
): GetExportsResult {
  // Get all entities in the file
  const allEntities = entityStore.findByFile(filePath);

  // Filter to only exported entities
  const exportedEntities = allEntities.filter(entity => {
    return entity.metadata?.['isExported'] === true;
  });

  // Map to ExportedEntity format
  const exports: ExportedEntity[] = exportedEntities.map(entity => {
    const exportType =
      (entity.metadata?.['exportType'] as ExportType | undefined) ?? 'named';
    const signature = entity.metadata?.['signature'] as string | undefined;

    const result: ExportedEntity = {
      entity,
      exportType,
    };

    if (signature !== undefined) {
      result.signature = signature;
    }

    return result;
  });

  return {
    filePath,
    exports,
    totalCount: exports.length,
  };
}
