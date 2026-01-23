/**
 * Find Dead Code tool - detects potentially unused functions, classes, and methods
 */

import { z } from 'zod';
import { findDeadCode, type DeadCodeConfidence } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse } from './types.js';
import { getStores } from './utils.js';

const findDeadCodeInputSchema = z.object({
  confidence: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .describe(
      'Minimum confidence level for results (default: high). ' +
        'High = non-exported with no calls. ' +
        'Medium = exported but no internal calls.'
    ),
  includeTests: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include entities from test files (default: false)'),
  maxResults: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of results to return (default: no limit)'),
});

/**
 * Format confidence level for display.
 */
function formatConfidence(confidence: DeadCodeConfidence): string {
  return confidence.toUpperCase();
}

/**
 * Find Dead Code tool definition
 *
 * Detects potentially unused functions, classes, and methods by finding
 * entities with no incoming calls, extends, or implements relationships.
 * Excludes entry points, test files (optionally), and lifecycle methods.
 */
export const findDeadCodeTool: ToolDefinition<typeof findDeadCodeInputSchema> =
  {
    metadata: {
      name: 'find_dead_code',
      description:
        'Find potentially unused functions, classes, and methods in the codebase. ' +
        'Detects entities with no incoming calls, extends, or implements relationships. ' +
        'Excludes entry points (index.ts, main.ts), lifecycle methods (constructor, ngOnInit, etc.), ' +
        'and optionally test files.',
      inputSchema: findDeadCodeInputSchema,
    },

    handler: (input) => {
      const { entityStore, relationshipStore } = getStores();

      // Build options object, only including defined values
      // (exactOptionalPropertyTypes requires we don't pass undefined explicitly)
      const options: Parameters<typeof findDeadCode>[2] = {
        // includeTests always has a value due to .default(false) in schema
        includeTests: input.includeTests,
      };
      if (input.confidence !== undefined) {
        options.minConfidence = input.confidence as DeadCodeConfidence;
      }
      if (input.maxResults !== undefined) {
        options.maxResults = input.maxResults;
      }

      const result = findDeadCode(entityStore, relationshipStore, options);

      if (result.unusedEntities.length === 0) {
        // Check if we have any analyzable entities in the graph
        const hasAnalyzableEntities =
          entityStore.findByType('function').length > 0 ||
          entityStore.findByType('class').length > 0 ||
          entityStore.findByType('method').length > 0;

        if (!hasAnalyzableEntities) {
          return createSuccessResponse(
            'No entities found in the code graph.\n\n' +
              'The codebase has not been parsed yet. ' +
              'Run parse_directory first to analyze your code.'
          );
        }

        return createSuccessResponse(
          'No potentially unused code found.\n\n' +
            'All analyzed code has incoming calls, extends, or implements relationships, ' +
            'or is in excluded locations (entry points, test files, lifecycle methods).'
        );
      }

      const lines: string[] = [
        '=== Dead Code Analysis ===',
        '',
        `Minimum confidence: ${input.confidence ?? 'high'}`,
        `Include tests: ${input.includeTests.toString()}`,
        '',
        '--- Potentially Unused Entities ---',
        '',
      ];

      for (const item of result.unusedEntities) {
        const { entity, confidence, reason, outgoingCount } = item;
        lines.push(
          `${entity.name} (${entity.type}) [${formatConfidence(confidence)}]`
        );
        lines.push(
          `  File: ${entity.filePath}:${entity.startLine.toString()}-${entity.endLine.toString()}`
        );
        lines.push(`  Reason: ${reason}`);
        if (outgoingCount > 0) {
          lines.push(`  Outgoing calls: ${outgoingCount.toString()}`);
        }
        lines.push('');
      }

      lines.push('--- Summary ---');
      lines.push('');
      lines.push(`Total potentially unused: ${result.summary.totalUnused.toString()}`);
      lines.push('');

      // By type
      const typeEntries = Object.entries(result.summary.byType);
      if (typeEntries.length > 0) {
        lines.push('By type:');
        for (const [type, count] of typeEntries) {
          lines.push(`  ${type}: ${count.toString()}`);
        }
        lines.push('');
      }

      // By confidence
      lines.push('By confidence:');
      lines.push(`  HIGH: ${result.summary.byConfidence.high.toString()}`);
      lines.push(`  MEDIUM: ${result.summary.byConfidence.medium.toString()}`);
      lines.push(`  LOW: ${result.summary.byConfidence.low.toString()}`);

      return createSuccessResponse(lines.join('\n'));
    },
  };
