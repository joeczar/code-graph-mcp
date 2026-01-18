import Database from 'better-sqlite3';

export interface DatabaseOptions {
  filePath: string;
  readonly?: boolean;
}

let dbInstance: Database.Database | null = null;

export function getDatabase(options?: DatabaseOptions): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const filePath = options?.filePath ?? ':memory:';
  const readonly = options?.readonly ?? false;

  dbInstance = new Database(filePath, { readonly });
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function resetDatabase(): void {
  closeDatabase();
}
