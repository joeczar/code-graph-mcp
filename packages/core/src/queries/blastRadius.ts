import { resolve } from 'node:path';
import type { EntityStore } from '../db/entities.js';
import type { RelationshipStore, RelationshipType } from '../db/relationships.js';
import type { AffectedEntity, BlastRadiusResult } from './types.js';

/**
 * Dependency relationship types to traverse for blast radius.
 * Does NOT include 'contains' which is structural, not a dependency.
 */
const DEPENDENCY_TYPES: RelationshipType[] = [
  'calls',
  'imports',
  'extends',
  'implements',
];

/**
 * Analyzes the blast radius of changes to a file.
 *
 * Starting from all entities in the target file, recursively finds all entities
 * that depend on them, up to the specified depth limit.
 *
 * @param filePath - The file to analyze
 * @param entityStore - Entity storage interface
 * @param relationshipStore - Relationship storage interface
 * @param maxDepth - Maximum depth to traverse (default: 5)
 * @returns Analysis result with affected entities and statistics
 *
 * @example
 * ```typescript
 * const result = blastRadius(
 *   '/src/utils/math.ts',
 *   entityStore,
 *   relationshipStore,
 *   3
 * );
 * console.log(`${result.summary.totalAffected} entities affected`);
 * ```
 */
export function blastRadius(
  filePath: string,
  entityStore: EntityStore,
  relationshipStore: RelationshipStore,
  maxDepth = 5
): BlastRadiusResult {
  // Resolve relative path to absolute
  const absolutePath = resolve(filePath);

  // Find all entities in the target file
  const sourceEntities = entityStore.findByFile(absolutePath);

  if (sourceEntities.length === 0) {
    return {
      sourceFile: filePath,
      sourceEntities: [],
      affectedEntities: [],
      summary: {
        totalAffected: 0,
        maxDepth: 0,
        directDependents: 0,
      },
    };
  }

  // Track visited entities to prevent cycles
  const visited = new Set<string>();
  const affectedEntities: AffectedEntity[] = [];
  let actualMaxDepth = 0;
  let directDependents = 0;

  // Queue for breadth-first traversal: [entityId, currentDepth]
  const queue: [string, number][] = [];

  // Initialize queue with all source entities at depth -1
  // (their dependents will be at depth 0)
  for (const entity of sourceEntities) {
    visited.add(entity.id);
    queue.push([entity.id, -1]);
  }

  // Breadth-first traversal
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) continue;

    const [entityId, depth] = item;
    const nextDepth = depth + 1;

    // Stop if we've reached the max depth
    if (nextDepth >= maxDepth) {
      continue;
    }

    // Find all relationships where this entity is the target
    const dependentRelationships = relationshipStore.findByTarget(entityId);

    for (const rel of dependentRelationships) {
      // Only traverse dependency relationships
      if (!DEPENDENCY_TYPES.includes(rel.type)) {
        continue;
      }

      // Skip if we've already visited this source entity
      if (visited.has(rel.sourceId)) {
        continue;
      }

      // Get the dependent entity
      const dependentEntity = entityStore.findById(rel.sourceId);
      if (!dependentEntity) {
        continue;
      }

      // Mark as visited and add to results
      visited.add(rel.sourceId);
      affectedEntities.push({
        entity: dependentEntity,
        depth: nextDepth,
      });

      // Update statistics
      if (nextDepth > actualMaxDepth) {
        actualMaxDepth = nextDepth;
      }
      if (nextDepth === 0) {
        directDependents++;
      }

      // Add to queue for further traversal
      queue.push([rel.sourceId, nextDepth]);
    }
  }

  return {
    sourceFile: filePath,
    sourceEntities,
    affectedEntities,
    summary: {
      totalAffected: affectedEntities.length,
      maxDepth: actualMaxDepth,
      directDependents,
    },
  };
}
