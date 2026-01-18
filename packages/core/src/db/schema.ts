import type Database from 'better-sqlite3';

export const ENTITIES_TABLE = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  language TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

export const ENTITIES_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type)',
  'CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name)',
  'CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_path)',
];

export const RELATIONSHIPS_TABLE = `
CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
)
`;

export const RELATIONSHIPS_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id)',
  'CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id)',
  'CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique ON relationships(source_id, target_id, type)',
];

export function initializeSchema(db: Database.Database): void {
  try {
    db.exec(ENTITIES_TABLE);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to create entities table: ${message}`);
  }

  for (const index of ENTITIES_INDEXES) {
    try {
      db.exec(index);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to create entity index: ${message}`);
    }
  }

  try {
    db.exec(RELATIONSHIPS_TABLE);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to create relationships table: ${message}`);
  }

  for (const index of RELATIONSHIPS_INDEXES) {
    try {
      db.exec(index);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Failed to create relationship index: ${message}`);
    }
  }
}
