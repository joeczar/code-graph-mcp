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
  const targetEntities = entityStore.findByName(name);

  if (targetEntities.length === 0) {
    return [];
  }

  // Collect all related IDs using functional approach
  const allRelatedIds = targetEntities.flatMap((entity) => {
    const relationships =
      direction === 'callers'
        ? relationshipStore.findByTarget(entity.id)
        : relationshipStore.findBySource(entity.id);

    return relationships
      .filter((rel) => rel.type === 'calls')
      .map((rel) => (direction === 'callers' ? rel.sourceId : rel.targetId));
  });

  // Deduplicate and fetch entities
  const uniqueRelatedIds = [...new Set(allRelatedIds)];

  return uniqueRelatedIds
    .map((id) => entityStore.findById(id))
    .filter((entity): entity is Entity => entity !== null);
}
