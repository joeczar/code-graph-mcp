/**
 * What Does Call tool - finds all entities called by a given entity
 */

import { z } from 'zod';
import { whatDoesCall } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';
import { getStores, formatEntityList } from './utils.js';

const whatDoesCallInputSchema = z.object({
  name: z.string().describe('Name of the entity to find callees for'),
});

/**
 * What Does Call tool definition
 *
 * Finds all entities called by the given entity name.
 * Searches by entity name and returns all callees with their locations.
 */
export const whatDoesCallTool: ToolDefinition<typeof whatDoesCallInputSchema> = {
  metadata: {
    name: 'what_does_call',
    description:
      'Find all entities called by a given entity. Returns callees with their type, file path, and line numbers.',
    inputSchema: whatDoesCallInputSchema,
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
    const callees = whatDoesCall(input.name, entityStore, relationshipStore);

    // Format output
    const output = formatEntityList(callees, {
      title: `Entities called by '${input.name}':`,
      emptyMessage: `No callees found for '${input.name}'.`,
      itemLabel: 'callee',
    });

    return createSuccessResponse(output);
  },
};
