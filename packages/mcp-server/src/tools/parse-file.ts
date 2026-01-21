/**
 * Parse File tool - parses a single file into the code graph
 *
 * Accepts a file path, parses it with tree-sitter, extracts entities
 * and relationships, and stores them in the database.
 *
 * Supports: TypeScript (.ts, .tsx), JavaScript (.js, .jsx), Ruby (.rb)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { FileProcessor, getDatabase, initializeSchema } from '@code-graph/core';
import { type ToolDefinition, createSuccessResponse, createErrorResponse } from './types.js';
import { ResourceNotFoundError, ToolExecutionError } from './errors.js';

const parseFileInputSchema = z.object({
  path: z.string().describe('Path to file to parse (absolute or relative to working directory)'),
});

/**
 * Parse file tool definition
 *
 * Parses a single file and stores entities/relationships in the graph database.
 * Returns a summary of what was parsed.
 */
export const parseFileTool: ToolDefinition<typeof parseFileInputSchema> = {
  metadata: {
    name: 'parse_file',
    description: 'Parse a single file into the code graph. Extracts entities (functions, classes, methods) and relationships (extends, calls). Supports TypeScript, JavaScript, and Ruby files.',
    inputSchema: parseFileInputSchema,
  },

  handler: async (input) => {
    const { path: inputPath } = input;

    // Resolve path (handle relative paths)
    const resolvedPath = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(process.cwd(), inputPath);

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return createErrorResponse(
        new ResourceNotFoundError(`File not found: ${resolvedPath}`, { path: resolvedPath })
      );
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      return createErrorResponse(
        new ToolExecutionError(`Path is not a file: ${resolvedPath}`, { path: resolvedPath })
      );
    }

    // Ensure database is initialized
    const db = getDatabase();
    initializeSchema(db);

    // Process the file
    const processor = new FileProcessor();
    const result = await processor.processFile({
      filePath: resolvedPath,
      db,
    });

    if (!result.success) {
      return createErrorResponse(
        new ToolExecutionError(`Failed to parse file: ${result.error ?? 'Unknown error'}`, {
          path: resolvedPath,
          error: result.error,
        })
      );
    }

    // Format success response
    const lines: string[] = [];
    lines.push(`=== File Parsed Successfully ===\n`);
    lines.push(`File: ${result.filePath}`);
    lines.push(`Language: ${result.language}`);
    lines.push(`Hash: ${result.fileHash.substring(0, 8)}...`);
    lines.push('');

    // Entity summary
    lines.push(`=== Entities (${String(result.entities.length)}) ===`);
    if (result.entities.length === 0) {
      lines.push('  (no entities extracted)');
    } else {
      // Group entities by type
      const byType = new Map<string, number>();
      for (const entity of result.entities) {
        const count = byType.get(entity.type) ?? 0;
        byType.set(entity.type, count + 1);
      }
      for (const [type, count] of byType) {
        lines.push(`  ${type}: ${String(count)}`);
      }
    }
    lines.push('');

    // Relationship summary
    lines.push(`=== Relationships (${String(result.relationships.length)}) ===`);
    if (result.relationships.length === 0) {
      lines.push('  (no relationships extracted)');
    } else {
      // Group relationships by type
      const byType = new Map<string, number>();
      for (const rel of result.relationships) {
        const count = byType.get(rel.type) ?? 0;
        byType.set(rel.type, count + 1);
      }
      for (const [type, count] of byType) {
        lines.push(`  ${type}: ${String(count)}`);
      }
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
