/**
 * Shared utilities for MCP tools
 *
 * Provides common functionality to reduce duplication across tools.
 */

import {
  getDatabase,
  createEntityStore,
  createRelationshipStore,
  type Entity,
  type EntityStore,
  type RelationshipStore,
} from '@code-graph/core';

/**
 * Create a unique key for an entity based on its logical identity.
 *
 * Two entities with the same name, file path, and start line are considered
 * duplicates even if they have different IDs (which can happen if the same
 * file is parsed multiple times).
 */
function getEntityKey(entity: Entity): string {
  return `${entity.name}|${entity.filePath}|${entity.startLine.toString()}`;
}

/**
 * Deduplicate entities by their logical identity (name, filePath, startLine).
 *
 * This handles cases where the same entity exists multiple times in the database
 * with different IDs (e.g., from multiple parse operations).
 *
 * @param entities - Array of entities that may contain duplicates
 * @returns Deduplicated array preserving the first occurrence of each entity
 */
export function deduplicateEntities(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  const result: Entity[] = [];

  for (const entity of entities) {
    const key = getEntityKey(entity);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entity);
    }
  }

  return result;
}

export interface Stores {
  entityStore: EntityStore;
  relationshipStore: RelationshipStore;
}

/**
 * Get initialized database and stores for tool handlers.
 *
 * Centralizes the common pattern of:
 * 1. Getting the database connection
 * 2. Creating entity store
 * 3. Creating relationship store
 *
 * @returns Object containing entityStore and relationshipStore
 */
export function getStores(): Stores {
  const db = getDatabase();
  return {
    entityStore: createEntityStore(db),
    relationshipStore: createRelationshipStore(db),
  };
}

export interface EntityListOptions {
  /** Title shown at the top of the output */
  title: string;
  /** Message shown when the list is empty */
  emptyMessage: string;
  /** Label for count summary (e.g., "caller", "callee", "entity") */
  itemLabel: string;
}

/**
 * Format a list of entities into a standardized output string.
 *
 * Handles common formatting patterns:
 * - Numbered list with name and type
 * - File location with line numbers
 * - Count summary at the end
 *
 * Entities are automatically deduplicated by (name, filePath, startLine) to
 * handle cases where duplicate entities exist in the database.
 *
 * @param entities - Array of entities to format
 * @param options - Formatting options
 * @returns Formatted string for tool output
 */
export function formatEntityList(
  entities: Entity[],
  options: EntityListOptions
): string {
  // Deduplicate entities by logical identity to prevent duplicates in output
  const uniqueEntities = deduplicateEntities(entities);
  const lines: string[] = [];

  if (uniqueEntities.length === 0) {
    lines.push(options.emptyMessage);
  } else {
    lines.push(options.title);
    lines.push('');

    uniqueEntities.forEach((entity, index) => {
      lines.push(`${(index + 1).toString()}. ${entity.name} (${entity.type})`);
      lines.push(`   File: ${entity.filePath}:${entity.startLine.toString()}-${entity.endLine.toString()}`);
      lines.push('');
    });

    // Handle pluralization - special case for words ending in 'y' (entity -> entities)
    const count = uniqueEntities.length;
    let pluralLabel = options.itemLabel;
    if (count !== 1) {
      if (options.itemLabel.endsWith('y')) {
        pluralLabel = options.itemLabel.slice(0, -1) + 'ies';
      } else {
        pluralLabel = options.itemLabel + 's';
      }
    }
    lines.push(`Total: ${count.toString()} ${pluralLabel} found`);
  }

  return lines.join('\n');
}

/**
 * Count occurrences of each type in an array of objects with a `type` property.
 *
 * Useful for summarizing entity or relationship counts by type.
 *
 * @param items - Array of objects with a `type` property
 * @returns Map of type names to counts
 */
export function countByType(items: { type: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  return counts;
}
