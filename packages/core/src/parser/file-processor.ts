import type Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { CodeParser } from './parser.js';
import { detectLanguage } from './languages.js';
import { createEntityStore, type Entity, type NewEntity } from '../db/entities.js';
import {
  createIncrementalUpdater,
  computeFileHash,
  type IncrementalUpdateResult,
} from '../db/incremental-updater.js';

export interface FileProcessorOptions {
  /**
   * If true, skip processing files whose content hash hasn't changed.
   * Requires files table to be initialized via migrations.
   */
  checkHash?: boolean;
}

export interface ProcessFileResult {
  filePath: string;
  action: 'skipped' | 'created' | 'updated' | 'error';
  entities?: Entity[];
  error?: string;
}

/**
 * Extract entities from parsed code and store in database.
 * This is a placeholder - actual entity extraction will be implemented
 * when language-specific parsers are added.
 */
function extractEntities(
  filePath: string,
  sourceCode: string,
  language: string
): NewEntity[] {
  // Placeholder: In a real implementation, this would use tree-sitter
  // to walk the AST and extract entities (functions, classes, etc.)
  // For now, just create a file entity
  return [
    {
      type: 'file',
      name: filePath.split('/').pop() || filePath,
      filePath,
      startLine: 1,
      endLine: sourceCode.split('\n').length,
      language,
      metadata: {
        lineCount: sourceCode.split('\n').length,
        characterCount: sourceCode.length,
      },
    },
  ];
}

export interface FileProcessor {
  processFile(filePath: string): Promise<ProcessFileResult>;
  removeStaleFiles(currentPaths: string[]): IncrementalUpdateResult[];
}

export function createFileProcessor(
  db: Database.Database,
  options: FileProcessorOptions = {}
): FileProcessor {
  const parser = new CodeParser();
  const entityStore = createEntityStore(db);
  const updater = createIncrementalUpdater(db);
  const { checkHash = false } = options;

  return {
    async processFile(filePath: string): Promise<ProcessFileResult> {
      // Detect language
      const language = detectLanguage(filePath);
      if (!language) {
        return {
          filePath,
          action: 'error',
          error: `Cannot detect language for file: ${filePath}`,
        };
      }

      // Read file content
      let content: string;
      try {
        content = await readFile(filePath, 'utf-8');
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        return {
          filePath,
          action: 'error',
          error: `Failed to read file: ${nodeErr.message}`,
        };
      }

      // Compute hash
      const contentHash = computeFileHash(content);

      // Check if we should skip (hash-based incremental update)
      if (checkHash) {
        const shouldReparse = await updater.shouldReparse(filePath, contentHash);
        if (!shouldReparse) {
          return {
            filePath,
            action: 'skipped',
            entities: entityStore.findByFile(filePath),
          };
        }
      }

      // Parse the file
      const parseResult = await parser.parseFile(filePath);
      if (!parseResult.success) {
        return {
          filePath,
          action: 'error',
          error: parseResult.error.message,
        };
      }

      // Extract entities (placeholder implementation)
      const newEntities = extractEntities(
        filePath,
        parseResult.result.sourceCode,
        parseResult.result.language
      );

      // Atomic update: delete old entities, insert new ones
      const isUpdate = entityStore.findByFile(filePath).length > 0;
      entityStore.deleteByFile(filePath);

      const entities: Entity[] = [];
      for (const entity of newEntities) {
        entities.push(entityStore.create(entity));
      }

      // Mark file as updated in file store
      updater.markFileUpdated(filePath, contentHash, language);

      return {
        filePath,
        action: isUpdate ? 'updated' : 'created',
        entities,
      };
    },

    removeStaleFiles(currentPaths: string[]): IncrementalUpdateResult[] {
      return updater.removeStaleFiles(currentPaths);
    },
  };
}
