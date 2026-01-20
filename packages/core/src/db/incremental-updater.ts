import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createFileStore, type FileRecord } from './files.js';
import { createEntityStore } from './entities.js';

export interface IncrementalUpdateResult {
  filePath: string;
  action: 'skipped' | 'created' | 'updated' | 'deleted';
  entitiesAffected?: number;
}

/**
 * Compute SHA-256 hash of file content
 */
export function computeFileHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Read file and compute its hash
 */
export async function computeFileHashFromPath(
  filePath: string
): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return computeFileHash(content);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw err;
  }
}

export interface IncrementalUpdater {
  shouldReparse(filePath: string, currentHash: string): boolean;
  markFileUpdated(
    filePath: string,
    contentHash: string,
    language: string
  ): FileRecord;
  deleteFile(filePath: string): IncrementalUpdateResult;
  removeStaleFiles(currentPaths: string[]): IncrementalUpdateResult[];
}

export function createIncrementalUpdater(
  db: Database.Database
): IncrementalUpdater {
  const fileStore = createFileStore(db);
  const entityStore = createEntityStore(db);

  return {
    shouldReparse(filePath: string, currentHash: string): boolean {
      const existing = fileStore.findByPath(filePath);
      if (!existing) {
        return true; // New file, needs parsing
      }
      return existing.contentHash !== currentHash; // Reparse if hash changed
    },

    markFileUpdated(
      filePath: string,
      contentHash: string,
      language: string
    ): FileRecord {
      return fileStore.upsertFile(filePath, contentHash, language);
    },

    deleteFile(filePath: string): IncrementalUpdateResult {
      const entitiesAffected = entityStore.deleteByFile(filePath);
      const fileDeleted = fileStore.deleteByPath(filePath);

      return {
        filePath,
        action: fileDeleted ? 'deleted' : 'skipped',
        entitiesAffected,
      };
    },

    removeStaleFiles(currentPaths: string[]): IncrementalUpdateResult[] {
      const staleFiles = fileStore.getStaleFiles(currentPaths);
      const results: IncrementalUpdateResult[] = [];

      for (const staleFile of staleFiles) {
        const entitiesAffected = entityStore.deleteByFile(staleFile.filePath);
        const fileDeleted = fileStore.deleteByPath(staleFile.filePath);

        results.push({
          filePath: staleFile.filePath,
          action: fileDeleted ? 'deleted' : 'skipped',
          entitiesAffected,
        });
      }

      return results;
    },
  };
}
