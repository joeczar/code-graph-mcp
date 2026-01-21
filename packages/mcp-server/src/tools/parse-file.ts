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
import { countByType } from './utils.js';

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

    // Check file exists and is a regular file (not a directory)
    // Use a single stat call to avoid race conditions between exists check and stat
    let stats: fs.Stats;
    try {
      stats = fs.statSync(resolvedPath);
    } catch (err) {
      // Handle specific filesystem errors with appropriate messages
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return createErrorResponse(
            new ResourceNotFoundError(`File not found: ${resolvedPath}`, { path: resolvedPath })
          );
        }
        if (code === 'EACCES') {
          return createErrorResponse(
            new ToolExecutionError(`Permission denied: ${resolvedPath}`, {
              path: resolvedPath,
              code,
            })
          );
        }
        // Other filesystem errors (ELOOP, ENAMETOOLONG, etc.)
        return createErrorResponse(
          new ToolExecutionError(`Cannot access file: ${resolvedPath}`, {
            path: resolvedPath,
            code,
            error: err.message,
          })
        );
      }
      // Unexpected error type
      return createErrorResponse(
        new ToolExecutionError(`Failed to check file: ${resolvedPath}`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    if (!stats.isFile()) {
      return createErrorResponse(
        new ToolExecutionError(`Path is not a file: ${resolvedPath}`, { path: resolvedPath })
      );
    }

    // Initialize database and process file
    // Wrapped in try-catch to handle database and parser initialization errors
    let db;
    try {
      db = getDatabase();
      initializeSchema(db);
    } catch (err) {
      return createErrorResponse(
        new ToolExecutionError(`Database initialization failed`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    // Process the file
    let result;
    try {
      const processor = new FileProcessor();
      result = await processor.processFile({
        filePath: resolvedPath,
        db,
      });
    } catch (err) {
      // Catch unexpected errors from parser initialization or processing
      return createErrorResponse(
        new ToolExecutionError(`Unexpected error during file processing`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

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
      for (const [type, count] of countByType(result.entities)) {
        lines.push(`  ${type}: ${String(count)}`);
      }
    }
    lines.push('');

    // Relationship summary
    lines.push(`=== Relationships (${String(result.relationships.length)}) ===`);
    if (result.relationships.length === 0) {
      lines.push('  (no relationships extracted)');
    } else {
      for (const [type, count] of countByType(result.relationships)) {
        lines.push(`  ${type}: ${String(count)}`);
      }
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
