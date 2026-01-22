/**
 * Parse Directory tool - parses all files in a directory recursively
 *
 * Accepts a directory path and optional glob pattern, parses all supported
 * files with tree-sitter (Ruby) or ts-morph (TypeScript/JavaScript), extracts
 * entities and relationships, and stores them in the database.
 * Respects .gitignore patterns.
 *
 * TypeScript/JavaScript parsing uses ts-morph for cross-file relationship
 * resolution, enabling accurate tracking of imports, function calls, and
 * class relationships across file boundaries.
 *
 * Supports: TypeScript (.ts, .tsx), JavaScript (.js, .jsx), Ruby (.rb)
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FileProcessor,
  TsMorphFileProcessor,
  getDatabase,
  initializeSchema,
  DirectoryParser,
  type Entity,
  type Relationship,
} from '@code-graph/core';
import { type ToolDefinition, type McpExtra, createSuccessResponse, createErrorResponse } from './types.js';
import { ResourceNotFoundError, ToolExecutionError } from './errors.js';
import { countByType } from './utils.js';
import { logger } from './logger.js';
import { getRubyLSPConfig } from '../config.js';

/**
 * TypeScript/JavaScript file extensions that should be processed with ts-morph
 */
const TS_JS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Check if a file should be processed with ts-morph (TypeScript/JavaScript)
 */
function isTsJsFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TS_JS_EXTENSIONS.includes(ext);
}

/**
 * Ruby file extensions that should be processed with tree-sitter
 */
const RUBY_EXTENSIONS = ['.rb'];

/**
 * Check if a file should be processed with tree-sitter (Ruby)
 */
function isRubyFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return RUBY_EXTENSIONS.includes(ext);
}

/**
 * Send a progress notification to the MCP client
 * Logs progress to console and sends MCP notification if client supports it
 */
async function sendProgress(
  extra: McpExtra | undefined,
  current: number,
  total: number,
  message: string
): Promise<void> {
  // Always log to console for visibility
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  logger.info(`[parse_directory] Progress: ${String(current)}/${String(total)} (${String(percent)}%) - ${message}`);

  // Send MCP progress notification if client provided a progress token
  const progressToken = extra?._meta?.progressToken;
  if (extra?.sendNotification && progressToken) {
    try {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken,
          progress: current,
          total,
          message,
        },
      });
    } catch (err) {
      // Don't fail the operation if progress notification fails
      logger.warn('Failed to send progress notification', { error: err });
    }
  }
}

const parseDirectoryInputSchema = z.object({
  path: z.string().describe('Path to directory to parse recursively (absolute or relative to working directory)'),
  pattern: z.string().optional().describe('Optional glob pattern to filter files (e.g., "**/*.ts", "src/**/*.js")'),
});

/**
 * Parse directory tool definition
 *
 * Parses all supported files in a directory recursively and stores
 * entities/relationships in the graph database. Respects .gitignore.
 * Returns a summary of what was parsed.
 */
export const parseDirectoryTool: ToolDefinition<typeof parseDirectoryInputSchema> = {
  metadata: {
    name: 'parse_directory',
    description: 'Parse all supported files in a directory recursively into the code graph. Extracts entities (functions, classes, methods) and relationships (extends, calls) from all TypeScript, JavaScript, and Ruby files. Respects .gitignore patterns.',
    inputSchema: parseDirectoryInputSchema,
  },

  handler: async (input, extra) => {
    const { path: inputPath, pattern } = input;

    // Resolve path (handle relative paths)
    const resolvedPath = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(process.cwd(), inputPath);

    // Check directory exists and is a directory
    let stats: fs.Stats;
    try {
      stats = fs.statSync(resolvedPath);
    } catch (err) {
      // Handle specific filesystem errors
      if (err instanceof Error && 'code' in err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return createErrorResponse(
            new ResourceNotFoundError(`Directory not found: ${resolvedPath}`, { path: resolvedPath })
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
        return createErrorResponse(
          new ToolExecutionError(`Cannot access directory: ${resolvedPath}`, {
            path: resolvedPath,
            code,
            error: err.message,
          })
        );
      }
      return createErrorResponse(
        new ToolExecutionError(`Failed to check directory: ${resolvedPath}`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    if (!stats.isDirectory()) {
      return createErrorResponse(
        new ToolExecutionError(`Path is not a directory: ${resolvedPath}`, { path: resolvedPath })
      );
    }

    // Initialize database
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

    // Use DirectoryParser to find files and FileProcessor to store in DB
    const directoryParser = new DirectoryParser();
    const rubyLSPConfig = getRubyLSPConfig();
    const processor = new FileProcessor(rubyLSPConfig);

    // Send initial progress notification
    await sendProgress(extra, 0, 0, 'Scanning directory for files...');

    // Parse directory using DirectoryParser (respects .gitignore)
    let parseResult;
    try {
      // Build extensions pattern if custom pattern is provided
      // DirectoryParser doesn't support custom glob patterns, so we'll filter after
      parseResult = await directoryParser.parseDirectory({
        directory: resolvedPath,
      });
    } catch (err) {
      return createErrorResponse(
        new ToolExecutionError(`Failed to parse directory: ${resolvedPath}`, {
          path: resolvedPath,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }

    // Filter results by pattern if provided
    let files = parseResult.files;
    if (pattern) {
      // Simple pattern matching - check if file path matches the pattern
      // This is a simplified version - for full glob support we'd need to use globby
      let patternRegex: RegExp;
      try {
        patternRegex = new RegExp(
          pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
        );
      } catch (err) {
        // Pattern contains characters that create invalid regex after transformation
        // (e.g., unbalanced brackets, parentheses, or other regex metacharacters)
        return createErrorResponse(
          new ToolExecutionError(`Invalid filter pattern: ${pattern}`, {
            path: resolvedPath,
            pattern,
            error: err instanceof Error ? err.message : String(err),
            hint: 'The pattern may contain special characters that are not supported. Use simple glob patterns like "**/*.ts" or "src/**/*.js".',
          })
        );
      }
      files = files.filter(f => patternRegex.test(f.filePath));
    }

    // Separate files by type: TS/JS files use ts-morph, Ruby files use tree-sitter
    const tsJsFiles = files.filter(f => isTsJsFile(f.filePath));
    const rubyFiles = files.filter(f => isRubyFile(f.filePath));
    const totalFiles = tsJsFiles.length + rubyFiles.length;

    await sendProgress(extra, 0, totalFiles, `Found ${String(totalFiles)} files to process (${String(tsJsFiles.length)} TS/JS, ${String(rubyFiles.length)} Ruby)`);

    // Initialize result tracking
    let successCount = 0;
    let errorCount = 0;
    const allEntities: Entity[] = [];
    const allRelationships: Relationship[] = [];
    const errors: string[] = [];

    // Phase 1: Process TypeScript/JavaScript files with ts-morph (for cross-file resolution)
    // TsMorphFileProcessor processes all TS/JS files at once to resolve cross-file relationships
    if (tsJsFiles.length > 0) {
      await sendProgress(extra, 0, totalFiles, `Processing ${String(tsJsFiles.length)} TypeScript/JavaScript files with ts-morph...`);

      const tsMorphProcessor = new TsMorphFileProcessor();

      try {
        // Process entire project at once for cross-file relationship resolution
        const tsResult = tsMorphProcessor.processProject({
          projectPath: resolvedPath,
          db,
          // Use default exclusions from ts-morph-project-parser
        });

        if (tsResult.success) {
          successCount += tsResult.stats?.filesScanned ?? tsJsFiles.length;
          // Collect entities (excluding file entities) and relationships
          allEntities.push(...tsResult.entities.filter(e => e.type !== 'file'));
          allRelationships.push(...tsResult.relationships);

          logger.info('TypeScript/JavaScript files processed with ts-morph', {
            directory: resolvedPath,
            filesScanned: tsResult.stats?.filesScanned,
            entitiesFound: tsResult.entities.length,
            relationshipsFound: tsResult.relationships.length,
          });
        } else {
          // ts-morph processing failed - count all TS/JS files as errors
          errorCount += tsJsFiles.length;
          const errorMessage = tsResult.error ?? 'Unknown ts-morph error';
          errors.push(`TypeScript/JavaScript processing: ${errorMessage}`);
          logger.error('ts-morph processing failed', {
            directory: resolvedPath,
            error: errorMessage,
          });
        }
      } catch (err) {
        errorCount += tsJsFiles.length;
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`TypeScript/JavaScript processing: ${errorMsg}`);
        logger.error('Unexpected error during ts-morph processing', {
          directory: resolvedPath,
          error: errorMsg,
        });
      }
    }

    // Phase 2: Process Ruby files with tree-sitter (file by file)
    // Ruby files are processed individually since tree-sitter doesn't support cross-file resolution
    if (rubyFiles.length > 0) {
      await sendProgress(extra, tsJsFiles.length, totalFiles, `Processing ${String(rubyFiles.length)} Ruby files with tree-sitter...`);

      for (let i = 0; i < rubyFiles.length; i++) {
        const fileResult = rubyFiles[i];
        if (!fileResult) continue;

        const relativePath = path.relative(resolvedPath, fileResult.filePath);
        const currentProgress = tsJsFiles.length + i + 1;
        await sendProgress(extra, currentProgress, totalFiles, `Processing Ruby: ${relativePath}`);

        // Skip files that failed to parse during directory scan
        if (!fileResult.success || !fileResult.result) {
          errorCount++;
          const errorMessage = fileResult.error ?? 'Unknown error';
          errors.push(`${relativePath}: ${errorMessage}`);
          logger.warn('Ruby file parsing failed during directory parse', {
            filePath: fileResult.filePath,
            directory: resolvedPath,
            error: errorMessage,
          });
          continue;
        }

        // Process Ruby file to store in database
        try {
          const storeResult = await processor.processFile({
            filePath: fileResult.filePath,
            db,
          });

          if (storeResult.success) {
            successCount++;
            allEntities.push(...storeResult.entities.filter(e => e.type !== 'file'));
            allRelationships.push(...storeResult.relationships);
          } else {
            errorCount++;
            const errorMessage = storeResult.error ?? 'Unknown error';
            errors.push(`${relativePath}: ${errorMessage}`);
            logger.warn('Ruby file storage failed during directory parse', {
              filePath: fileResult.filePath,
              directory: resolvedPath,
              error: errorMessage,
            });
          }
        } catch (err) {
          errorCount++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push(`${relativePath}: ${errorMsg}`);
          logger.error('Unexpected error processing Ruby file during directory parse', {
            filePath: fileResult.filePath,
            directory: resolvedPath,
            error: errorMsg,
          });
        }
      }
    }

    // Send completion notification
    await sendProgress(
      extra,
      totalFiles,
      totalFiles,
      `Completed: ${String(successCount)} successful, ${String(errorCount)} errors`
    );

    // Format success response
    const lines: string[] = [];
    lines.push(`=== Directory Parsed Successfully ===\n`);
    lines.push(`Directory: ${resolvedPath}`);
    if (pattern) {
      lines.push(`Pattern: ${pattern}`);
    }
    lines.push(`Total Files: ${String(totalFiles)}`);
    lines.push(`  TypeScript/JavaScript: ${String(tsJsFiles.length)} (ts-morph with cross-file resolution)`);
    lines.push(`  Ruby: ${String(rubyFiles.length)} (tree-sitter)`);
    lines.push(`Successful: ${String(successCount)}`);
    lines.push(`Errors: ${String(errorCount)}`);
    lines.push('');

    // Entity summary
    lines.push(`=== Entities (${String(allEntities.length)}) ===`);
    if (allEntities.length === 0) {
      lines.push('  (no entities extracted)');
    } else {
      for (const [type, count] of countByType(allEntities)) {
        lines.push(`  ${type}: ${String(count)}`);
      }
    }
    lines.push('');

    // Relationship summary
    lines.push(`=== Relationships (${String(allRelationships.length)}) ===`);
    if (allRelationships.length === 0) {
      lines.push('  (no relationships extracted)');
    } else {
      for (const [type, count] of countByType(allRelationships)) {
        lines.push(`  ${type}: ${String(count)}`);
      }
    }

    // Show errors if any (limit to first 10)
    if (errors.length > 0) {
      lines.push('');
      lines.push(`=== Errors (${String(errors.length)}) ===`);
      for (const error of errors.slice(0, 10)) {
        lines.push(`  ${error}`);
      }
      if (errors.length > 10) {
        lines.push(`  ... and ${String(errors.length - 10)} more`);
      }
    }

    return createSuccessResponse(lines.join('\n'));
  },
};
