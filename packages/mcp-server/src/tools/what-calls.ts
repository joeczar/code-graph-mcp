/**
 * What Calls tool - finds all entities that call a given entity
 *
 * Given an entity name, finds all callers by:
 * 1. Finding entities with matching name
 * 2. Finding relationships where target is the entity and type is 'calls'
 * 3. Getting source entities for each relationship
 * 4. Formatting results with entity info and location
 */

import { z } from 'zod';
import { getDatabase } from '@code-graph/core';
import { createEntityStore, createRelationshipStore } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';

const whatCallsInputSchema = z.object({
  name: z.string().describe('Name of the entity to find callers for'),
});

/**
 * What Calls tool definition
 *
 * Finds all entities that call the given entity name.
 * Searches by entity name and returns all callers with their locations.
 */
export const whatCallsTool: ToolDefinition<typeof whatCallsInputSchema> = {
  metadata: {
    name: 'what_calls',
    description:
      'Find all entities that call a given entity. Returns callers with their type, file path, and line numbers.',
    inputSchema: whatCallsInputSchema,
  },

  handler: (input) => {
    const db = getDatabase();
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    // Find entities by name
    const entities = entityStore.findByName(input.name);

    if (entities.length === 0) {
      return createSuccessResponse(
        `No entities found with name '${input.name}'.`
      );
    }

    // Find all callers for each matching entity
    const callers: Array<{
      caller: { name: string; type: string; filePath: string; startLine: number; endLine: number };
      targetEntity: { name: string; type: string };
    }> = [];

    for (const entity of entities) {
      // Find relationships where this entity is the target
      const relationships = relationshipStore.findByTarget(entity.id);

      // Filter to 'calls' relationships
      const callRelationships = relationships.filter(rel => rel.type === 'calls');

      // Get source entities for each call relationship
      for (const rel of callRelationships) {
        const sourceEntity = entityStore.findById(rel.sourceId);
        if (sourceEntity) {
          callers.push({
            caller: {
              name: sourceEntity.name,
              type: sourceEntity.type,
              filePath: sourceEntity.filePath,
              startLine: sourceEntity.startLine,
              endLine: sourceEntity.endLine,
            },
            targetEntity: {
              name: entity.name,
              type: entity.type,
            },
          });
        }
      }
    }

    // Format output
    const lines: string[] = [];

    if (callers.length === 0) {
      lines.push(`No callers found for '${input.name}'.`);
    } else {
      lines.push(`Entities calling '${input.name}':\n`);

      callers.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.caller.name} (${item.caller.type})`);
        lines.push(`   File: ${item.caller.filePath}:${item.caller.startLine}-${item.caller.endLine}`);
        lines.push('');
      });

      lines.push(`Total: ${callers.length} caller${callers.length === 1 ? '' : 's'} found`);
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
