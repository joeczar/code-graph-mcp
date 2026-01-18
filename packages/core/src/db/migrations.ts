import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial',
    up: `
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
      );

      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_file ON entities(file_path);

      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);
      CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);
      CREATE INDEX IF NOT EXISTS idx_rel_type ON relationships(type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_unique ON relationships(source_id, target_id, type);
    `,
    down: `
      DROP TABLE IF EXISTS relationships;
      DROP TABLE IF EXISTS entities;
    `,
  },
];

export interface MigrationRunner {
  run(): number;
  rollback(): boolean;
  getApplied(): number[];
  getPending(): Migration[];
}

export function createMigrationRunner(db: Database.Database): MigrationRunner {
  // Ensure migrations table exists
  db.exec(MIGRATIONS_TABLE);

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
  );
  const deleteMigration = db.prepare(
    'DELETE FROM schema_migrations WHERE version = ?'
  );
  const selectApplied = db.prepare(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  const selectLatest = db.prepare(
    'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1'
  );

  return {
    run(): number {
      const applied = this.getApplied();
      const pending = migrations.filter((m) => !applied.includes(m.version));
      let count = 0;

      for (const migration of pending.sort((a, b) => a.version - b.version)) {
        try {
          db.exec('BEGIN TRANSACTION');
          db.exec(migration.up);
          insertMigration.run(migration.version, migration.name);
          db.exec('COMMIT');
          count++;
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // Rollback may fail if transaction wasn't started, ignore
          }
          const message = err instanceof Error ? err.message : 'Unknown error';
          throw new Error(
            `Migration ${String(migration.version)} (${migration.name}) failed: ${message}`
          );
        }
      }

      return count;
    },

    rollback(): boolean {
      const latest = selectLatest.get() as
        | { version: number; name: string }
        | undefined;

      if (!latest) {
        return false;
      }

      const migration = migrations.find((m) => m.version === latest.version);
      if (!migration) {
        return false;
      }

      try {
        db.exec('BEGIN TRANSACTION');
        db.exec(migration.down);
        deleteMigration.run(migration.version);
        db.exec('COMMIT');
        return true;
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          // Rollback may fail if transaction wasn't started, ignore
        }
        const message = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(
          `Rollback of migration ${String(migration.version)} (${migration.name}) failed: ${message}`
        );
      }
    },

    getApplied(): number[] {
      const rows = selectApplied.all() as { version: number }[];
      return rows.map((r) => r.version);
    },

    getPending(): Migration[] {
      const applied = this.getApplied();
      return migrations
        .filter((m) => !applied.includes(m.version))
        .sort((a, b) => a.version - b.version);
    },
  };
}
