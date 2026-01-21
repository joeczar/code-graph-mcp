/**
 * Find Entity tool - searches for entities in the knowledge graph
 *
 * Provides flexible entity search with support for:
 * - Name pattern matching (exact, prefix, contains)
 * - Entity type filtering
 * - File path filtering
 */

import { z } from 'zod';
import type { Entity, EntityType } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';
import { getStores, formatEntityList } from './utils.js';

const findEntityInputSchema = z.object({
  namePattern: z.string().optional().describe('Name pattern to search for'),
  matchMode: z
    .enum(['exact', 'prefix', 'contains'])
    .optional()
    .default('contains')
    .describe('How to match the name pattern (default: contains)'),
  type: z
    .enum(['function', 'class', 'method', 'module', 'file', 'type'])
    .optional()
    .describe('Filter by entity type'),
  filePath: z.string().optional().describe('Filter by file path'),
});

/**
 * Matches entity name against pattern using specified mode
 */
function matchesPattern(
  entityName: string,
  pattern: string,
  mode: 'exact' | 'prefix' | 'contains'
): boolean {
  const lowerName = entityName.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  switch (mode) {
    case 'exact':
      return lowerName === lowerPattern;
    case 'prefix':
      return lowerName.startsWith(lowerPattern);
    case 'contains':
      return lowerName.includes(lowerPattern);
  }
}

/**
 * Find entity tool definition
 *
 * Searches for entities based on name pattern, type, and file path.
 */
export const findEntityTool: ToolDefinition<typeof findEntityInputSchema> = {
  metadata: {
    name: 'find_entity',
    description:
      'Search for entities in the knowledge graph by name, type, or file path',
    inputSchema: findEntityInputSchema,
  },

  handler: (input) => {
    const { entityStore } = getStores();

    // Start with all entities or filter by file/type
    let entities: Entity[] = [];

    if (input.filePath) {
      entities = entityStore.findByFile(input.filePath);
    } else if (input.type) {
      entities = entityStore.findByType(input.type);
    } else {
      // Get all entities by querying each type
      const types: EntityType[] = [
        'function',
        'class',
        'method',
        'module',
        'file',
        'type',
      ];
      for (const type of types) {
        entities.push(...entityStore.findByType(type));
      }
    }

    // Apply additional filters
    if (input.type && !input.filePath) {
      entities = entities.filter((e) => e.type === input.type);
    }

    if (input.namePattern) {
      const pattern = input.namePattern;
      entities = entities.filter((e) =>
        matchesPattern(e.name, pattern, input.matchMode)
      );
    }

    // Build query description for header
    const queryParts: string[] = [];
    if (input.namePattern) {
      queryParts.push(`name ${input.matchMode} "${input.namePattern}"`);
    }
    if (input.type) {
      queryParts.push(`type: ${input.type}`);
    }
    if (input.filePath) {
      queryParts.push(`file: ${input.filePath}`);
    }

    const queryStr = queryParts.length > 0 ? `Query: ${queryParts.join(', ')}\n\n` : '';

    // Format output using shared helper
    const listOutput = formatEntityList(entities, {
      title: `Found ${entities.length.toString()} ${entities.length === 1 ? 'entity' : 'entities'}:`,
      emptyMessage: 'No entities found.',
      itemLabel: 'entity',
    });

    return createSuccessResponse(`=== Entity Search Results ===\n${queryStr}${listOutput}`);
  },
};
