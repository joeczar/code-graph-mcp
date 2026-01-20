import type { Entity, EntityStore } from '../db/entities.js';
import type { RelationshipStore } from '../db/relationships.js';

/**
 * Find all entities that call the given entity.
 *
 * @param name - Name of the entity to find callers for
 * @param entityStore - Entity store to query
 * @param relationshipStore - Relationship store to query
 * @returns Array of entities that call the named entity
 */
export function whatCalls(
  name: string,
  entityStore: EntityStore,
  relationshipStore: RelationshipStore
): Entity[] {
  // Find all entities with the given name
  const targetEntities = entityStore.findByName(name);

  if (targetEntities.length === 0) {
    return [];
  }

  // Collect all callers across all matching entities
  const callers: Entity[] = [];
  const seenIds = new Set<string>();

  for (const target of targetEntities) {
    // Find all relationships where this entity is the target
    const relationships = relationshipStore.findByTarget(target.id);

    // Filter to only 'calls' relationships
    const callRelationships = relationships.filter(rel => rel.type === 'calls');

    // Get the source entity for each call relationship
    for (const rel of callRelationships) {
      // Avoid duplicates if same caller appears multiple times
      if (!seenIds.has(rel.sourceId)) {
        const caller = entityStore.findById(rel.sourceId);
        if (caller) {
          callers.push(caller);
          seenIds.add(rel.sourceId);
        }
      }
    }
  }

  return callers;
}
