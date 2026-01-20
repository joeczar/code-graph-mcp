import type { Entity, EntityStore } from '../db/entities.js';
import type { RelationshipStore } from '../db/relationships.js';

export type RelationDirection = 'callers' | 'callees';

/**
 * Find related entities by traversing call relationships.
 *
 * This is a shared helper that powers both whatCalls and whatDoesCall:
 * - 'callers': Finds entities that call the named entity (incoming edges)
 * - 'callees': Finds entities called by the named entity (outgoing edges)
 *
 * @param name - Name of the entity to find relationships for
 * @param entityStore - Entity store to query
 * @param relationshipStore - Relationship store to query
 * @param direction - 'callers' for incoming calls, 'callees' for outgoing calls
 * @returns Array of related entities (deduplicated)
 */
export function findRelatedEntities(
  name: string,
  entityStore: EntityStore,
  relationshipStore: RelationshipStore,
  direction: RelationDirection
): Entity[] {
  // Find all entities with the given name
  const targetEntities = entityStore.findByName(name);

  if (targetEntities.length === 0) {
    return [];
  }

  // Collect all related entities across all matches
  const related: Entity[] = [];
  const seenIds = new Set<string>();

  for (const entity of targetEntities) {
    // Get relationships based on direction
    const relationships =
      direction === 'callers'
        ? relationshipStore.findByTarget(entity.id)
        : relationshipStore.findBySource(entity.id);

    // Filter to only 'calls' relationships
    const callRelationships = relationships.filter(
      (rel) => rel.type === 'calls'
    );

    // Get the related entity for each call relationship
    for (const rel of callRelationships) {
      const relatedId =
        direction === 'callers' ? rel.sourceId : rel.targetId;

      // Avoid duplicates
      if (!seenIds.has(relatedId)) {
        const relatedEntity = entityStore.findById(relatedId);
        if (relatedEntity) {
          related.push(relatedEntity);
          seenIds.add(relatedId);
        }
      }
    }
  }

  return related;
}
