import type { Entity, EntityStore } from '../db/entities.js';
import type { RelationshipStore } from '../db/relationships.js';
import { findRelatedEntities } from './findRelatedEntities.js';

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
  return findRelatedEntities(name, entityStore, relationshipStore, 'callees');
}
