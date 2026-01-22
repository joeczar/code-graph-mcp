import { describe, it, expect, afterEach } from 'vitest';
import { getDatabase, closeDatabase, resetDatabase } from '../connection.js';

describe('Database Connection', () => {
  afterEach(() => {
    resetDatabase();
  });

  it('creates an in-memory database by default', () => {
    const db = getDatabase();
    expect(db).toBeDefined();
    expect(db.open).toBe(true);
  });

  it('returns the same instance on subsequent calls', () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2);
  });

  it('closes the database', () => {
    const db = getDatabase();
    expect(db.open).toBe(true);
    closeDatabase();
    expect(db.open).toBe(false);
  });

  it('resets allows creating new database', () => {
    const db1 = getDatabase();
    resetDatabase();
    const db2 = getDatabase();
    expect(db1).not.toBe(db2);
  });

  it('has foreign keys enabled', () => {
    const db = getDatabase();
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0]?.foreign_keys).toBe(1);
  });

  it('sets appropriate journal mode', () => {
    const db = getDatabase();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    // In-memory databases can't use WAL, they use 'memory' mode
    // File-based databases will use 'wal' mode
    expect(['wal', 'memory']).toContain(result[0]?.journal_mode);
  });

  it('has performance optimizations enabled', () => {
    const db = getDatabase();

    // synchronous=NORMAL (1) for write performance
    const syncResult = db.pragma('synchronous') as { synchronous: number }[];
    expect(syncResult[0]?.synchronous).toBe(1);

    // cache_size should be 10000 pages (negative means KB, positive means pages)
    const cacheResult = db.pragma('cache_size') as { cache_size: number }[];
    expect(cacheResult[0]?.cache_size).toBe(10000);

    // temp_store=MEMORY (2)
    const tempResult = db.pragma('temp_store') as { temp_store: number }[];
    expect(tempResult[0]?.temp_store).toBe(2);
  });
});
