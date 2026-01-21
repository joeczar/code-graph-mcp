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
 * @param entities - Array of entities to format
 * @param options - Formatting options
 * @returns Formatted string for tool output
 */
export function formatEntityList(
  entities: Entity[],
  options: EntityListOptions
): string {
  const lines: string[] = [];

  if (entities.length === 0) {
    lines.push(options.emptyMessage);
  } else {
    lines.push(options.title);
    lines.push('');

    entities.forEach((entity, index) => {
      lines.push(`${(index + 1).toString()}. ${entity.name} (${entity.type})`);
      lines.push(`   File: ${entity.filePath}:${entity.startLine.toString()}-${entity.endLine.toString()}`);
      lines.push('');
    });

    const plural = entities.length === 1 ? '' : 's';
    lines.push(`Total: ${entities.length.toString()} ${options.itemLabel}${plural} found`);
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
