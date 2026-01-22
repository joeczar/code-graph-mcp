import Database from 'better-sqlite3';

export interface DatabaseOptions {
  filePath: string;
  readonly?: boolean;
}

let dbInstance: Database.Database | null = null;
let currentFilePath: string | null = null;

export function getDatabase(options?: DatabaseOptions): Database.Database {
  const filePath = options?.filePath ?? ':memory:';

  if (dbInstance) {
    // Warn if attempting to open a different database without resetting first
    if (currentFilePath && currentFilePath !== filePath) {
      throw new Error(
        `Database already open at "${currentFilePath}". ` +
          `Call resetDatabase() first to open a different database.`
      );
    }
    return dbInstance;
  }

  const readonly = options?.readonly ?? false;

  try {
    dbInstance = new Database(filePath, { readonly });

    // WAL mode doesn't work with in-memory databases
    if (filePath !== ':memory:') {
      dbInstance.pragma('journal_mode = WAL');
    }
    dbInstance.pragma('foreign_keys = ON');

    // Performance optimizations for bulk indexing operations
    // synchronous=NORMAL: trades some durability for significant write speed gain
    // cache_size=10000: ~40MB cache (10000 pages * 4KB default page size)
    // temp_store=MEMORY: keep temporary tables in memory
    dbInstance.pragma('synchronous = NORMAL');
    dbInstance.pragma('cache_size = 10000');
    dbInstance.pragma('temp_store = MEMORY');

    currentFilePath = filePath;
    return dbInstance;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to open database at "${filePath}": ${message}`);
  }
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function resetDatabase(): void {
  closeDatabase();
  currentFilePath = null;
}
