import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, resetDatabase } from '../connection.js';
import { createMigrationRunner, migrations, type MigrationRunner } from '../migrations.js';

describe('MigrationRunner', () => {
  let runner: MigrationRunner;

  beforeEach(() => {
    const db = getDatabase();
    runner = createMigrationRunner(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('migrations array', () => {
    it('has at least one migration', () => {
      expect(migrations.length).toBeGreaterThan(0);
    });

    it('has initial migration with version 1', () => {
      const initial = migrations.find((m) => m.version === 1);
      expect(initial).toBeDefined();
      expect(initial?.name).toBe('initial');
    });

    it('migrations have unique versions', () => {
      const versions = migrations.map((m) => m.version);
      const uniqueVersions = [...new Set(versions)];
      expect(versions.length).toBe(uniqueVersions.length);
    });
  });

  describe('run', () => {
    it('applies pending migrations', () => {
      const count = runner.run();

      expect(count).toBe(migrations.length);
      expect(runner.getApplied()).toHaveLength(migrations.length);
    });

    it('returns 0 when no pending migrations', () => {
      runner.run();
      const count = runner.run();

      expect(count).toBe(0);
    });

    it('creates tables from initial migration', () => {
      runner.run();

      const db = getDatabase();

      // Check entities table exists
      const entitiesInfo = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='entities'")
        .get() as { name: string } | undefined;
      expect(entitiesInfo?.name).toBe('entities');

      // Check relationships table exists
      const relsInfo = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='relationships'")
        .get() as { name: string } | undefined;
      expect(relsInfo?.name).toBe('relationships');
    });
  });

  describe('rollback', () => {
    it('rolls back the latest migration', () => {
      runner.run();
      expect(runner.getApplied()).toHaveLength(migrations.length);

      const rolled = runner.rollback();

      expect(rolled).toBe(true);
      expect(runner.getApplied()).toHaveLength(migrations.length - 1);
    });

    it('returns false when no migrations to rollback', () => {
      const rolled = runner.rollback();
      expect(rolled).toBe(false);
    });

    it('drops tables on rollback', () => {
      runner.run();

      const db = getDatabase();

      // Verify tables exist
      let tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('entities', 'relationships')")
        .all() as { name: string }[];
      expect(tables).toHaveLength(2);

      runner.rollback();

      // Verify tables dropped
      tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('entities', 'relationships')")
        .all() as { name: string }[];
      expect(tables).toHaveLength(0);
    });
  });

  describe('getApplied', () => {
    it('returns empty array initially', () => {
      const applied = runner.getApplied();
      expect(applied).toEqual([]);
    });

    it('returns applied migration versions', () => {
      runner.run();
      const applied = runner.getApplied();

      expect(applied).toEqual(migrations.map((m) => m.version));
    });
  });

  describe('getPending', () => {
    it('returns all migrations initially', () => {
      const pending = runner.getPending();
      expect(pending).toHaveLength(migrations.length);
    });

    it('returns empty array after all applied', () => {
      runner.run();
      const pending = runner.getPending();

      expect(pending).toHaveLength(0);
    });

    it('returns pending migrations sorted by version', () => {
      const pending = runner.getPending();

      for (let i = 1; i < pending.length; i++) {
        const prev = pending[i - 1];
        const curr = pending[i];
        if (prev && curr) {
          expect(prev.version).toBeLessThan(curr.version);
        }
      }
    });
  });
});
