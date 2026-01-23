/**
 * Circular Dependencies tool - detects import/dependency cycles in the codebase
 *
 * Uses DFS with back-edge detection to find all cycles in the dependency graph.
 * Can analyze the entire codebase or focus on cycles involving a specific entity.
 */

import { z } from 'zod';
import {
  findCircularDependencies,
  type CircularDependencyResult,
} from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';
import { getStores } from './utils.js';

const circularDependenciesInputSchema = z.object({
  entityName: z
    .string()
    .optional()
    .describe(
      'Name of entity to find cycles for (optional - if omitted, finds all cycles)'
    ),
  maxCycles: z
    .number()
    .optional()
    .default(100)
    .describe('Maximum number of cycles to find (default: 100, 0 = unlimited)'),
});

/**
 * Format the circular dependency result for human-readable output.
 */
function formatResult(
  result: CircularDependencyResult,
  entityName: string | undefined,
  maxCycles: number
): string {
  const lines: string[] = [];
  lines.push('=== Circular Dependency Analysis ===');

  if (entityName) {
    lines.push(`Entity: ${entityName}`);
  }
  lines.push('');

  if (!result.hasCycles) {
    lines.push('No circular dependencies found.');
    return lines.join('\n');
  }

  lines.push(`Found ${result.cycles.length.toString()} cycle(s):`);
  lines.push('');

  for (let i = 0; i < result.cycles.length; i++) {
    const cycle = result.cycles[i];
    if (!cycle) continue;
    lines.push(`Cycle ${(i + 1).toString()}:`);

    // Format the cycle as a chain
    const chainParts: string[] = [];
    for (let j = 0; j < cycle.entities.length; j++) {
      const entity = cycle.entities[j];
      if (!entity) continue;
      const relType = cycle.relationshipTypes[j];
      chainParts.push(`  ${entity.name} (${entity.type})`);
      chainParts.push(`    ${entity.filePath}:${entity.startLine.toString()}`);
      if (relType) {
        chainParts.push(`    --[${relType}]-->`);
      }
    }
    // Complete the cycle back to the first entity
    const firstEntity = cycle.entities[0];
    if (firstEntity) {
      chainParts.push(
        `  ${firstEntity.name} (${firstEntity.type}) [cycle complete]`
      );
    }

    lines.push(chainParts.join('\n'));
    lines.push('');
  }

  // Summary statistics
  lines.push('Summary:');
  lines.push(`- Total cycles: ${result.summary.totalCycles.toString()}`);
  lines.push(`- Entities involved: ${result.summary.entitiesInCycles.toString()}`);
  lines.push(`- Shortest cycle: ${result.summary.shortestCycle.toString()} entities`);
  lines.push(`- Longest cycle: ${result.summary.longestCycle.toString()} entities`);

  if (maxCycles > 0 && result.cycles.length >= maxCycles) {
    lines.push('');
    lines.push(
      `Note: Limited to ${maxCycles.toString()} cycles. Use maxCycles=0 for unlimited.`
    );
  }

  return lines.join('\n');
}

/**
 * Circular dependencies tool definition
 *
 * Detects import/dependency cycles in the codebase using DFS with back-edge detection.
 */
export const circularDependenciesTool: ToolDefinition<
  typeof circularDependenciesInputSchema
> = {
  metadata: {
    name: 'circular_dependencies',
    description:
      'Detect circular import/dependency cycles in the codebase. Reports cycles with full path.',
    inputSchema: circularDependenciesInputSchema,
  },

  handler: (input) => {
    const { entityStore, relationshipStore } = getStores();

    // Check if graph has entities
    const entityCount = entityStore.count();
    if (entityCount === 0) {
      return createSuccessResponse(
        '=== Circular Dependency Analysis ===\n\nNo entities found in the graph. Run parse_directory first.'
      );
    }

    // Check if specified entity exists
    if (input.entityName) {
      const entities = entityStore.findByName(input.entityName);
      if (entities.length === 0) {
        return createSuccessResponse(
          `=== Circular Dependency Analysis ===\nEntity: ${input.entityName}\n\nNo entity found with name "${input.entityName}".`
        );
      }
    }

    // Use the core function to find circular dependencies
    const result = findCircularDependencies(
      entityStore,
      relationshipStore,
      input.entityName,
      input.maxCycles
    );

    return createSuccessResponse(
      formatResult(result, input.entityName, input.maxCycles)
    );
  },
};
