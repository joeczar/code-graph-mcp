/**
 * Get Exports tool - lists all exported entities from a file
 *
 * Shows:
 * - Export type (default/named)
 * - Entity type (function, class, etc.)
 * - Entity name
 * - Line numbers
 * - Signature (if available)
 */

import { z } from 'zod';
import { type ToolDefinition, createSuccessResponse } from './types.js';
import { getStores } from './utils.js';

const getExportsInputSchema = z.object({
  filePath: z.string().min(1).describe('Path to the file to list exports from'),
});

/**
 * Get exports tool definition
 *
 * Retrieves all entities from a file and filters for those with
 * isExported metadata set to true.
 */
export const getExportsTool: ToolDefinition<typeof getExportsInputSchema> = {
  metadata: {
    name: 'get_exports',
    description: 'List all exported entities from a file with their types and locations',
    inputSchema: getExportsInputSchema,
  },

  handler: (input) => {
    const { entityStore } = getStores();

    // Get all entities in the file
    const entities = entityStore.findByFile(input.filePath);

    // Filter for exported entities
    const exports = entities.filter(
      (e) => e.metadata?.['isExported'] === true
    );

    // Format output
    const lines: string[] = [];
    lines.push(`=== Exports from ${input.filePath} ===`);
    lines.push('');

    if (exports.length === 0) {
      lines.push('(no exports)');
      return createSuccessResponse(lines.join('\n'));
    }

    lines.push(`Total Exports: ${exports.length.toString()}`);
    lines.push('');

    for (const entity of exports) {
      const exportType = (entity.metadata?.['exportType'] as string | undefined) ?? 'named';
      lines.push(`[${exportType}] ${entity.type} ${entity.name}`);
      lines.push(`  Lines: ${entity.startLine.toString()}-${entity.endLine.toString()}`);

      if (entity.metadata?.['signature']) {
        lines.push(`  Signature: ${entity.metadata['signature'] as string}`);
      }
      lines.push('');
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
