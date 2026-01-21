/**
 * What Calls tool - finds all entities that call a given entity
 */

import { z } from 'zod';
import { whatCalls } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';
import { getStores, formatEntityList } from './utils.js';

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
    const { entityStore, relationshipStore } = getStores();

    // Check if entity exists
    const entities = entityStore.findByName(input.name);
    if (entities.length === 0) {
      return createSuccessResponse(
        `No entities found with name '${input.name}'.`
      );
    }

    // Use core query function
    const callers = whatCalls(input.name, entityStore, relationshipStore);

    // Format output
    const output = formatEntityList(callers, {
      title: `Entities calling '${input.name}':`,
      emptyMessage: `No callers found for '${input.name}'.`,
      itemLabel: 'caller',
    });

    return createSuccessResponse(output);
  },
};
