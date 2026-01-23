import type { Entity, EntityStore } from '../db/entities.js';
import type { RelationshipStore } from '../db/relationships.js';

export type RelationDirection = 'callers' | 'callees';

// Relationship types that indicate a dependency on the target entity
// - 'calls': direct function/method calls
// - 'extends': class inheritance (child class depends on parent)
// - 'implements': interface/module implementation
const DEPENDENCY_RELATIONSHIP_TYPES = new Set(['calls', 'extends', 'implements']);

/**
 * Find related entities by traversing dependency relationships.
 *
 * This is a shared helper that powers both whatCalls and whatDoesCall:
 * - 'callers': Finds entities that depend on the named entity (incoming edges)
 *   Includes: direct calls, class inheritance (extends), module inclusion (implements)
 * - 'callees': Finds entities that the named entity depends on (outgoing edges)
 *   Includes: only direct calls (for now)
 *
 * @param name - Name of the entity to find relationships for
 * @param entityStore - Entity store to query
 * @param relationshipStore - Relationship store to query
 * @param direction - 'callers' for incoming dependencies, 'callees' for outgoing calls
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

    // For 'callers', include all dependency relationships (calls, extends, implements)
    // For 'callees', only include direct calls
    const relevantTypes = direction === 'callers'
      ? DEPENDENCY_RELATIONSHIP_TYPES
      : new Set(['calls']);

    return relationships
      .filter((rel) => relevantTypes.has(rel.type))
      .map((rel) => (direction === 'callers' ? rel.sourceId : rel.targetId));
  });

  // Deduplicate and fetch entities
  const uniqueRelatedIds = [...new Set(allRelatedIds)];

  return uniqueRelatedIds
    .map((id) => entityStore.findById(id))
    .filter((entity): entity is Entity => entity !== null);
}
