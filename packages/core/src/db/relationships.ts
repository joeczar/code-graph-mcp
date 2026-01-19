import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type RelationshipType =
  | 'calls'
  | 'imports'
  | 'extends'
  | 'implements'
  | 'contains';

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export type NewRelationship = Omit<Relationship, 'id' | 'createdAt'>;

interface RelationshipRow {
  id: string;
  source_id: string;
  target_id: string;
  type: string;
  metadata: string | null;
  created_at: string;
}

function rowToRelationship(row: RelationshipRow): Relationship {
  const rel: Relationship = {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    type: row.type as RelationshipType,
    createdAt: row.created_at,
  };

  if (row.metadata) {
    try {
      rel.metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      console.warn(
        `Failed to parse metadata for relationship ${row.id}, skipping metadata`
      );
    }
  }

  return rel;
}

export interface RelationshipStore {
  create(rel: NewRelationship): Relationship;
  findById(id: string): Relationship | null;
  findBySource(sourceId: string): Relationship[];
  findByTarget(targetId: string): Relationship[];
  findByType(type: RelationshipType): Relationship[];
  findBetween(sourceId: string, targetId: string): Relationship[];
  delete(id: string): boolean;
  deleteByEntity(entityId: string): number;
  count(): number;
  countByType(): Record<RelationshipType, number>;
}

export function createRelationshipStore(db: Database.Database): RelationshipStore {
  const insertStmt = db.prepare(`
    INSERT INTO relationships (id, source_id, target_id, type, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);

  const selectByIdStmt = db.prepare('SELECT * FROM relationships WHERE id = ?');
  const selectBySourceStmt = db.prepare(
    'SELECT * FROM relationships WHERE source_id = ?'
  );
  const selectByTargetStmt = db.prepare(
    'SELECT * FROM relationships WHERE target_id = ?'
  );
  const selectByTypeStmt = db.prepare(
    'SELECT * FROM relationships WHERE type = ?'
  );
  const selectBetweenStmt = db.prepare(
    'SELECT * FROM relationships WHERE source_id = ? AND target_id = ?'
  );
  const deleteByIdStmt = db.prepare('DELETE FROM relationships WHERE id = ?');
  const deleteByEntityStmt = db.prepare(
    'DELETE FROM relationships WHERE source_id = ? OR target_id = ?'
  );
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM relationships');
  const countByTypeStmt = db.prepare(
    'SELECT type, COUNT(*) as count FROM relationships GROUP BY type'
  );

  return {
    create(rel: NewRelationship): Relationship {
      const id = randomUUID();
      const metadata = rel.metadata ? JSON.stringify(rel.metadata) : null;

      insertStmt.run(id, rel.sourceId, rel.targetId, rel.type, metadata);

      const created = selectByIdStmt.get(id) as RelationshipRow;
      return rowToRelationship(created);
    },

    findById(id: string): Relationship | null {
      const row = selectByIdStmt.get(id) as RelationshipRow | undefined;
      return row ? rowToRelationship(row) : null;
    },

    findBySource(sourceId: string): Relationship[] {
      const rows = selectBySourceStmt.all(sourceId) as RelationshipRow[];
      return rows.map(rowToRelationship);
    },

    findByTarget(targetId: string): Relationship[] {
      const rows = selectByTargetStmt.all(targetId) as RelationshipRow[];
      return rows.map(rowToRelationship);
    },

    findByType(type: RelationshipType): Relationship[] {
      const rows = selectByTypeStmt.all(type) as RelationshipRow[];
      return rows.map(rowToRelationship);
    },

    findBetween(sourceId: string, targetId: string): Relationship[] {
      const rows = selectBetweenStmt.all(sourceId, targetId) as RelationshipRow[];
      return rows.map(rowToRelationship);
    },

    delete(id: string): boolean {
      const result = deleteByIdStmt.run(id);
      return result.changes > 0;
    },

    deleteByEntity(entityId: string): number {
      const result = deleteByEntityStmt.run(entityId, entityId);
      return result.changes;
    },

    count(): number {
      const row = countStmt.get() as { count: number };
      return row.count;
    },

    countByType(): Record<RelationshipType, number> {
      const rows = countByTypeStmt.all() as { type: string; count: number }[];

      // Initialize all types to 0
      const result: Record<RelationshipType, number> = {
        calls: 0,
        imports: 0,
        extends: 0,
        implements: 0,
        contains: 0,
      };

      // Fill in actual counts from database
      for (const row of rows) {
        result[row.type as RelationshipType] = row.count;
      }

      return result;
    },
  };
}
