import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type EntityType =
  | 'function'
  | 'class'
  | 'method'
  | 'module'
  | 'file'
  | 'type';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export type NewEntity = Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>;

interface EntityRow {
  id: string;
  type: string;
  name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  language: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEntity(row: EntityRow): Entity {
  const entity: Entity = {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.metadata) {
    try {
      entity.metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      console.warn(
        `Failed to parse metadata for entity ${row.id}, skipping metadata`
      );
    }
  }

  return entity;
}

export interface RecentFile {
  filePath: string;
  entityCount: number;
  lastUpdated: string;
}

export interface EntityStore {
  create(entity: NewEntity): Entity;
  findById(id: string): Entity | null;
  findByName(name: string): Entity[];
  findByFile(filePath: string): Entity[];
  findByType(type: EntityType): Entity[];
  update(id: string, updates: Partial<NewEntity>): Entity | null;
  delete(id: string): boolean;
  deleteByFile(filePath: string): number;
  count(): number;
  countByType(): Record<EntityType, number>;
  getRecentFiles(limit: number): RecentFile[];
}

export function createEntityStore(db: Database.Database): EntityStore {
  const insertStmt = db.prepare(`
    INSERT INTO entities (id, type, name, file_path, start_line, end_line, language, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const selectByIdStmt = db.prepare('SELECT * FROM entities WHERE id = ?');
  const selectByNameStmt = db.prepare('SELECT * FROM entities WHERE name = ?');
  const selectByFileStmt = db.prepare(
    'SELECT * FROM entities WHERE file_path = ?'
  );
  const selectByTypeStmt = db.prepare('SELECT * FROM entities WHERE type = ?');
  const deleteByIdStmt = db.prepare('DELETE FROM entities WHERE id = ?');
  const deleteByFileStmt = db.prepare(
    'DELETE FROM entities WHERE file_path = ?'
  );
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM entities');
  const countByTypeStmt = db.prepare(
    'SELECT type, COUNT(*) as count FROM entities GROUP BY type'
  );
  const recentFilesStmt = db.prepare(`
    SELECT
      file_path as filePath,
      COUNT(*) as entityCount,
      MAX(updated_at) as lastUpdated
    FROM entities
    GROUP BY file_path
    ORDER BY lastUpdated DESC
    LIMIT ?
  `);

  return {
    create(entity: NewEntity): Entity {
      const id = randomUUID();
      const metadata = entity.metadata ? JSON.stringify(entity.metadata) : null;

      insertStmt.run(
        id,
        entity.type,
        entity.name,
        entity.filePath,
        entity.startLine,
        entity.endLine,
        entity.language,
        metadata
      );

      const created = selectByIdStmt.get(id) as EntityRow;
      return rowToEntity(created);
    },

    findById(id: string): Entity | null {
      const row = selectByIdStmt.get(id) as EntityRow | undefined;
      return row ? rowToEntity(row) : null;
    },

    findByName(name: string): Entity[] {
      const rows = selectByNameStmt.all(name) as EntityRow[];
      return rows.map(rowToEntity);
    },

    findByFile(filePath: string): Entity[] {
      const rows = selectByFileStmt.all(filePath) as EntityRow[];
      return rows.map(rowToEntity);
    },

    findByType(type: EntityType): Entity[] {
      const rows = selectByTypeStmt.all(type) as EntityRow[];
      return rows.map(rowToEntity);
    },

    update(id: string, updates: Partial<NewEntity>): Entity | null {
      const existing = selectByIdStmt.get(id) as EntityRow | undefined;
      if (!existing) {
        return null;
      }

      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.type !== undefined) {
        fields.push('type = ?');
        values.push(updates.type);
      }
      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.filePath !== undefined) {
        fields.push('file_path = ?');
        values.push(updates.filePath);
      }
      if (updates.startLine !== undefined) {
        fields.push('start_line = ?');
        values.push(updates.startLine);
      }
      if (updates.endLine !== undefined) {
        fields.push('end_line = ?');
        values.push(updates.endLine);
      }
      if (updates.language !== undefined) {
        fields.push('language = ?');
        values.push(updates.language);
      }
      if (updates.metadata !== undefined) {
        fields.push('metadata = ?');
        values.push(JSON.stringify(updates.metadata));
      }

      if (fields.length === 0) {
        return rowToEntity(existing);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const updateStmt = db.prepare(
        `UPDATE entities SET ${fields.join(', ')} WHERE id = ?`
      );
      updateStmt.run(...values);

      const updated = selectByIdStmt.get(id) as EntityRow;
      return rowToEntity(updated);
    },

    delete(id: string): boolean {
      const result = deleteByIdStmt.run(id);
      return result.changes > 0;
    },

    deleteByFile(filePath: string): number {
      const result = deleteByFileStmt.run(filePath);
      return result.changes;
    },

    count(): number {
      const row = countStmt.get() as { count: number };
      return row.count;
    },

    countByType(): Record<EntityType, number> {
      const rows = countByTypeStmt.all() as { type: string; count: number }[];

      // Initialize all types to 0
      const result: Record<EntityType, number> = {
        function: 0,
        class: 0,
        method: 0,
        module: 0,
        file: 0,
        type: 0,
      };

      // Fill in actual counts from database
      for (const row of rows) {
        result[row.type as EntityType] = row.count;
      }

      return result;
    },

    getRecentFiles(limit: number): RecentFile[] {
      const rows = recentFilesStmt.all(limit) as RecentFile[];
      return rows;
    },
  };
}
