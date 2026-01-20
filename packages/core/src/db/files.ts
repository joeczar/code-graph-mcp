import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface FileRecord {
  id: string;
  filePath: string;
  contentHash: string;
  language: string;
  updatedAt: string;
}

interface FileRow {
  id: string;
  file_path: string;
  content_hash: string;
  language: string;
  updated_at: string;
}

function rowToFileRecord(row: FileRow): FileRecord {
  return {
    id: row.id,
    filePath: row.file_path,
    contentHash: row.content_hash,
    language: row.language,
    updatedAt: row.updated_at,
  };
}

export interface FileStore {
  upsertFile(filePath: string, contentHash: string, language: string): FileRecord;
  findByPath(filePath: string): FileRecord | null;
  findByHash(hash: string): FileRecord[];
  deleteByPath(filePath: string): boolean;
  getStaleFiles(currentPaths: string[]): FileRecord[];
}

export function createFileStore(db: Database.Database): FileStore {
  const selectByPathStmt = db.prepare('SELECT * FROM files WHERE file_path = ?');
  const selectByHashStmt = db.prepare('SELECT * FROM files WHERE content_hash = ?');
  const deleteByPathStmt = db.prepare('DELETE FROM files WHERE file_path = ?');

  // Upsert using INSERT OR REPLACE
  const upsertStmt = db.prepare(`
    INSERT INTO files (id, file_path, content_hash, language, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(file_path) DO UPDATE SET
      content_hash = excluded.content_hash,
      language = excluded.language,
      updated_at = datetime('now')
  `);

  return {
    upsertFile(filePath: string, contentHash: string, language: string): FileRecord {
      // Check if file exists to preserve ID
      const existing = selectByPathStmt.get(filePath) as FileRow | undefined;
      const id = existing?.id ?? randomUUID();

      upsertStmt.run(id, filePath, contentHash, language);

      const inserted = selectByPathStmt.get(filePath) as FileRow;
      return rowToFileRecord(inserted);
    },

    findByPath(filePath: string): FileRecord | null {
      const row = selectByPathStmt.get(filePath) as FileRow | undefined;
      return row ? rowToFileRecord(row) : null;
    },

    findByHash(hash: string): FileRecord[] {
      const rows = selectByHashStmt.all(hash) as FileRow[];
      return rows.map(rowToFileRecord);
    },

    deleteByPath(filePath: string): boolean {
      const result = deleteByPathStmt.run(filePath);
      return result.changes > 0;
    },

    getStaleFiles(currentPaths: string[]): FileRecord[] {
      if (currentPaths.length === 0) {
        const allStmt = db.prepare('SELECT * FROM files');
        const rows = allStmt.all() as FileRow[];
        return rows.map(rowToFileRecord);
      }

      // Build placeholders for IN clause
      const placeholders = currentPaths.map(() => '?').join(',');
      const staleStmt = db.prepare(
        `SELECT * FROM files WHERE file_path NOT IN (${placeholders})`
      );

      const rows = staleStmt.all(...currentPaths) as FileRow[];
      return rows.map(rowToFileRecord);
    },
  };
}
