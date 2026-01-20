/**
 * Find Entity tool - searches for entities in the knowledge graph
 *
 * Provides flexible entity search with support for:
 * - Name pattern matching (exact, prefix, contains)
 * - Entity type filtering
 * - File path filtering
 */

import { z } from 'zod';
import { getDatabase } from '@code-graph/core';
import { createEntityStore } from '@code-graph/core';
import type { Entity, EntityType } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';

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
 *
 * @param entityName - Name of the entity
 * @param pattern - Pattern to match against
 * @param mode - Match mode (exact, prefix, contains)
 * @returns True if the entity name matches the pattern
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
 * Results are formatted with entity details including location.
 */
export const findEntityTool: ToolDefinition<typeof findEntityInputSchema> = {
  metadata: {
    name: 'find_entity',
    description:
      'Search for entities in the knowledge graph by name, type, or file path',
    inputSchema: findEntityInputSchema,
  },

  handler: (input) => {
    const db = getDatabase();
    const entityStore = createEntityStore(db);

    // Start with all entities or filter by file/type
    let entities: Entity[] = [];

    if (input.filePath) {
      entities = entityStore.findByFile(input.filePath);
    } else if (input.type) {
      entities = entityStore.findByType(input.type);
    } else {
      // Need to get all entities - do this by getting each type
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

    // Format output
    const lines: string[] = [];

    lines.push('=== Entity Search Results ===');

    // Build query description
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

    if (queryParts.length > 0) {
      lines.push(`Query: ${queryParts.join(', ')}`);
    }
    lines.push('');

    if (entities.length === 0) {
      lines.push('No entities found.');
    } else {
      lines.push(`Found ${entities.length.toString()} ${entities.length === 1 ? 'entity' : 'entities'}:`);
      lines.push('');

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (!entity) {
          continue;
        }
        lines.push(
          `${(i + 1).toString()}. ${entity.name} (${entity.type})`
        );
        lines.push(
          `   File: ${entity.filePath}:${entity.startLine.toString()}-${entity.endLine.toString()}`
        );
        lines.push('');
      }
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
