/**
 * What Does Call tool - finds all entities called by a given entity
 *
 * Given an entity name, finds all callees by:
 * 1. Finding entities with matching name
 * 2. Finding relationships where source is the entity and type is 'calls'
 * 3. Getting target entities for each relationship
 * 4. Formatting results with entity info and location
 */

import { z } from 'zod';
import { getDatabase } from '@code-graph/core';
import { createEntityStore, createRelationshipStore } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';

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

    // Find all callees for each matching entity
    const callees: {
      callee: { name: string; type: string; filePath: string; startLine: number; endLine: number };
      sourceEntity: { name: string; type: string };
    }[] = [];

    for (const entity of entities) {
      // Find relationships where this entity is the source
      const relationships = relationshipStore.findBySource(entity.id);

      // Filter to 'calls' relationships
      const callRelationships = relationships.filter(rel => rel.type === 'calls');

      // Get target entities for each call relationship
      for (const rel of callRelationships) {
        const targetEntity = entityStore.findById(rel.targetId);
        if (targetEntity) {
          callees.push({
            callee: {
              name: targetEntity.name,
              type: targetEntity.type,
              filePath: targetEntity.filePath,
              startLine: targetEntity.startLine,
              endLine: targetEntity.endLine,
            },
            sourceEntity: {
              name: entity.name,
              type: entity.type,
            },
          });
        }
      }
    }

    // Format output
    const lines: string[] = [];

    if (callees.length === 0) {
      lines.push(`No callees found for '${input.name}'.`);
    } else {
      lines.push(`Entities called by '${input.name}':\n`);

      callees.forEach((item, index) => {
        lines.push(`${(index + 1).toString()}. ${item.callee.name} (${item.callee.type})`);
        lines.push(`   File: ${item.callee.filePath}:${item.callee.startLine.toString()}-${item.callee.endLine.toString()}`);
        lines.push('');
      });

      lines.push(`Total: ${callees.length.toString()} callee${callees.length === 1 ? '' : 's'} found`);
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
