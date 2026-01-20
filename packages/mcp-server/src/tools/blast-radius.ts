/**
 * Blast Radius tool - analyzes the impact of changes to a file
 *
 * Finds all entities in a file and recursively discovers which other
 * entities depend on them, showing the potential "blast radius" of changes.
 */

import { z } from 'zod';
import { getDatabase } from '@code-graph/core';
import { createEntityStore, createRelationshipStore } from '@code-graph/core';
import type { Entity } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';

const blastRadiusInputSchema = z.object({
  filePath: z.string().describe('Path to the file to analyze'),
  maxDepth: z
    .number()
    .optional()
    .default(5)
    .describe('Maximum depth to traverse (default: 5)'),
});

interface AffectedEntity {
  entity: Entity;
  depth: number;
}

/**
 * Recursively finds entities that depend on the given entity IDs
 *
 * @param entityIds - IDs to find dependents of
 * @param relationshipStore - Store to query relationships
 * @param entityStore - Store to query entities
 * @param currentDepth - Current recursion depth
 * @param maxDepth - Maximum depth to traverse
 * @param visited - Set of already visited entity IDs
 * @param results - Accumulated results
 */
function findDependents(
  entityIds: string[],
  relationshipStore: ReturnType<typeof createRelationshipStore>,
  entityStore: ReturnType<typeof createEntityStore>,
  currentDepth: number,
  maxDepth: number,
  visited: Set<string>,
  results: AffectedEntity[]
): void {
  if (currentDepth > maxDepth || entityIds.length === 0) {
    return;
  }

  const nextLevelIds: string[] = [];

  for (const entityId of entityIds) {
    // Find all relationships where this entity is the target (i.e., something depends on it)
    const relationships = relationshipStore.findByTarget(entityId);

    for (const rel of relationships) {
      // Skip if we've already visited this source entity
      if (visited.has(rel.sourceId)) {
        continue;
      }

      // Get the source entity that depends on our target
      const sourceEntity = entityStore.findById(rel.sourceId);
      if (!sourceEntity) {
        continue;
      }

      visited.add(rel.sourceId);
      results.push({
        entity: sourceEntity,
        depth: currentDepth,
      });
      nextLevelIds.push(rel.sourceId);
    }
  }

  // Recurse to next depth level
  if (nextLevelIds.length > 0) {
    findDependents(
      nextLevelIds,
      relationshipStore,
      entityStore,
      currentDepth + 1,
      maxDepth,
      visited,
      results
    );
  }
}

/**
 * Blast radius tool definition
 *
 * Analyzes the impact of changes to a file by finding all entities
 * that directly or indirectly depend on entities in that file.
 */
export const blastRadiusTool: ToolDefinition<typeof blastRadiusInputSchema> = {
  metadata: {
    name: 'blast_radius',
    description:
      'Analyze the impact of changes to a file by finding all entities that depend on it',
    inputSchema: blastRadiusInputSchema,
  },

  handler: (input) => {
    const db = getDatabase();
    const entityStore = createEntityStore(db);
    const relationshipStore = createRelationshipStore(db);

    // Find all entities in the specified file
    const sourceEntities = entityStore.findByFile(input.filePath);

    if (sourceEntities.length === 0) {
      return createSuccessResponse(
        `=== Blast Radius Analysis ===\nFile: ${input.filePath}\n\nNo entities found in this file.`
      );
    }

    // Find all dependents recursively
    const visited = new Set<string>();
    const affectedEntities: AffectedEntity[] = [];

    // Mark source entities as visited so we don't include them in results
    for (const entity of sourceEntities) {
      visited.add(entity.id);
    }

    findDependents(
      sourceEntities.map((e) => e.id),
      relationshipStore,
      entityStore,
      1,
      input.maxDepth,
      visited,
      affectedEntities
    );

    // Format output
    const lines: string[] = [];

    lines.push('=== Blast Radius Analysis ===');
    lines.push(`File: ${input.filePath}`);
    lines.push('');

    // Source entities
    lines.push('Source Entities:');
    for (const entity of sourceEntities) {
      lines.push(
        `- ${entity.name} (${entity.type}) [lines ${entity.startLine.toString()}-${entity.endLine.toString()}]`
      );
    }
    lines.push('');

    // Affected entities by depth
    if (affectedEntities.length === 0) {
      lines.push('No affected entities found.');
    } else {
      lines.push('Affected Entities (by depth):');
      lines.push('');

      // Group by depth
      const byDepth = new Map<number, AffectedEntity[]>();
      for (const affected of affectedEntities) {
        const existing = byDepth.get(affected.depth) || [];
        existing.push(affected);
        byDepth.set(affected.depth, existing);
      }

      // Sort depths and display
      const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
      for (const depth of depths) {
        const entities = byDepth.get(depth) || [];
        lines.push(`Depth ${depth.toString()}:`);
        for (const { entity } of entities) {
          lines.push(
            `- ${entity.name} (${entity.type}) in ${entity.filePath}:${entity.startLine.toString()}-${entity.endLine.toString()}`
          );
        }
        lines.push('');
      }

      // Summary
      lines.push('Summary:');
      const maxDepthReached = Math.max(...depths);
      const directDependents = byDepth.get(1)?.length || 0;
      lines.push(`- Total affected: ${affectedEntities.length.toString()} entities`);
      lines.push(`- Max depth reached: ${maxDepthReached.toString()}`);
      lines.push(`- Direct dependents: ${directDependents.toString()}`);
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
