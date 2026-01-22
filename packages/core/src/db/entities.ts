import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

/** All valid entity types */
export const ALL_ENTITY_TYPES = [
  'function',
  'class',
  'method',
  'module',
  'file',
  'type',
  'variable',
  'enum',
] as const;

export type EntityType = (typeof ALL_ENTITY_TYPES)[number];

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

export interface EntityQuery {
  namePattern?: string;
  matchMode?: 'exact' | 'prefix' | 'contains';
  type?: EntityType;
  filePath?: string;
}

export interface EntityStore {
  create(entity: NewEntity): Entity;
  /**
   * Batch insert multiple entities at once.
   * Significantly faster than individual inserts for bulk operations.
   * Returns the created entities with generated IDs.
   */
  createBatch(entities: NewEntity[]): Entity[];
  findById(id: string): Entity | null;
  findByName(name: string): Entity[];
  findByFile(filePath: string): Entity[];
  findByType(type: EntityType): Entity[];
  findEntity(query: EntityQuery): Entity[];
  /**
   * Find an entity by name and file path.
   * Used for cross-file relationship resolution.
   * Returns first match or null if not found.
   */
  findByNameAndFile(name: string, filePath: string): Entity | null;
  /**
   * Get all entities in the database.
   * Used to pre-populate entity lookup cache for batch processing.
   */
  getAll(): Entity[];
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
  const selectByNameAndFileStmt = db.prepare(
    'SELECT * FROM entities WHERE name = ? AND file_path = ?'
  );

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

    createBatch(entities: NewEntity[]): Entity[] {
      if (entities.length === 0) {
        return [];
      }

      // Generate IDs and prepare data
      const prepared = entities.map(entity => ({
        id: randomUUID(),
        type: entity.type,
        name: entity.name,
        filePath: entity.filePath,
        startLine: entity.startLine,
        endLine: entity.endLine,
        language: entity.language,
        metadata: entity.metadata ? JSON.stringify(entity.metadata) : null,
      }));

      // Insert all entities using prepared statement
      for (const entity of prepared) {
        insertStmt.run(
          entity.id,
          entity.type,
          entity.name,
          entity.filePath,
          entity.startLine,
          entity.endLine,
          entity.language,
          entity.metadata
        );
      }

      // Return entities without re-querying DB
      // Build result directly from inserted data with current timestamp
      const now = new Date().toISOString();
      return prepared.map(entity => ({
        id: entity.id,
        type: entity.type as EntityType,
        name: entity.name,
        filePath: entity.filePath,
        startLine: entity.startLine,
        endLine: entity.endLine,
        language: entity.language,
        ...(entity.metadata && { metadata: JSON.parse(entity.metadata) as Record<string, unknown> }),
        createdAt: now,
        updatedAt: now,
      }));
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

    findByNameAndFile(name: string, filePath: string): Entity | null {
      const row = selectByNameAndFileStmt.get(name, filePath) as EntityRow | undefined;
      return row ? rowToEntity(row) : null;
    },

    getAll(): Entity[] {
      const selectAllStmt = db.prepare('SELECT * FROM entities');
      const rows = selectAllStmt.all() as EntityRow[];
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

      // Initialize all types to 0 using the constant
      const result = Object.fromEntries(
        ALL_ENTITY_TYPES.map(t => [t, 0])
      ) as Record<EntityType, number>;

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

    findEntity(query: EntityQuery): Entity[] {
      const whereClauses: string[] = [];
      const params: unknown[] = [];

      // Handle name pattern matching
      if (query.namePattern !== undefined) {
        const matchMode = query.matchMode ?? 'contains';

        if (matchMode === 'exact') {
          whereClauses.push('name = ?');
          params.push(query.namePattern);
        } else if (matchMode === 'prefix') {
          whereClauses.push('name LIKE ? || \'%\'');
          params.push(query.namePattern);
        } else {
          // contains
          whereClauses.push('name LIKE \'%\' || ? || \'%\'');
          params.push(query.namePattern);
        }
      }

      // Handle type filter
      if (query.type !== undefined) {
        whereClauses.push('type = ?');
        params.push(query.type);
      }

      // Handle file path filter
      if (query.filePath !== undefined) {
        whereClauses.push('file_path = ?');
        params.push(query.filePath);
      }

      // Build final query
      let sql = 'SELECT * FROM entities';
      if (whereClauses.length > 0) {
        sql += ' WHERE ' + whereClauses.join(' AND ');
      }

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as EntityRow[];
      return rows.map(rowToEntity);
    },
  };
}
