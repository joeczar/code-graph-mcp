import type { Entity, EntityStore } from '../db/entities.js';
import type { RelationshipStore } from '../db/relationships.js';
import { findRelatedEntities } from './findRelatedEntities.js';

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
  return findRelatedEntities(name, entityStore, relationshipStore, 'callers');
}
