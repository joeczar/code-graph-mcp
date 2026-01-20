import type { Entity, EntityStore, RelationshipStore } from '../db/index.js';

/**
 * Find all entities that a given entity calls.
 *
 * This is the inverse of whatCalls - it returns outgoing calls (callees)
 * rather than incoming calls (callers).
 *
 * @param name - Name of the entity to find callees for
 * @param entityStore - Entity store instance
 * @param relationshipStore - Relationship store instance
 * @returns Array of entities that are called by the named entity
 *
 * @example
 * ```typescript
 * // Find what processData calls
 * const callees = whatDoesCall('processData', entityStore, relationshipStore);
 * // Returns: [validateInput, transformData, saveOutput]
 * ```
 */
export function whatDoesCall(
  name: string,
  entityStore: EntityStore,
  relationshipStore: RelationshipStore
): Entity[] {
  // Find all entities with this name
  const entities = entityStore.findByName(name);

  if (entities.length === 0) {
    return [];
  }

  // Collect all callees across all matching entities
  const callees: Entity[] = [];
  const seenIds = new Set<string>();

  for (const entity of entities) {
    // Find all relationships where this entity is the source
    const relationships = relationshipStore.findBySource(entity.id);

    // Filter to only 'calls' relationships
    const callRelationships = relationships.filter(rel => rel.type === 'calls');

    // Fetch the target entities (callees)
    for (const rel of callRelationships) {
      // Avoid duplicates if multiple entities call the same target
      if (!seenIds.has(rel.targetId)) {
        const callee = entityStore.findById(rel.targetId);
        if (callee) {
          callees.push(callee);
          seenIds.add(rel.targetId);
        }
      }
    }
  }

  return callees;
}
