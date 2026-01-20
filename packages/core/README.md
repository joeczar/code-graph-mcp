# @code-graph-mcp/core

Core library for the Code Graph MCP server providing code parsing, entity extraction, and knowledge graph storage.

## Features

### Incremental Update System

The core package includes a complete incremental update system that optimizes parsing by only processing changed files:

#### 1. File Content Hashing

Every parsed file's content is hashed using SHA-256 and stored in the database:

```typescript
import { createFileProcessor } from '@code-graph-mcp/core';

const processor = createFileProcessor(db, { checkHash: true });
const result = await processor.processFile('/path/to/file.ts');
// result.action: 'created' | 'updated' | 'skipped' | 'error'
```

#### 2. Change Detection

Files are automatically compared against stored hashes to detect changes:

```typescript
// First parse
await processor.processFile('/path/to/file.ts'); // action: 'created'

// Second parse (no changes)
await processor.processFile('/path/to/file.ts'); // action: 'skipped'

// After modification
await processor.processFile('/path/to/file.ts'); // action: 'updated'
```

#### 3. Entity Management

When a file is reparsed, old entities are automatically removed before new ones are inserted:

- Old entities are deleted atomically
- New entities are inserted
- All changes happen in a transaction

#### 4. Relationship Integrity

Relationships are automatically maintained through CASCADE constraints:

- When an entity is deleted, all relationships involving it are removed
- No orphaned relationships remain in the database
- Foreign key constraints ensure referential integrity

### Usage Example

```typescript
import { getDatabase } from '@code-graph-mcp/core';
import { createMigrationRunner } from '@code-graph-mcp/core';
import { createFileProcessor } from '@code-graph-mcp/core';

// Setup database
const db = getDatabase({ filePath: './code-graph.db' });
const runner = createMigrationRunner(db);
runner.run();

// Create processor with incremental updates
const processor = createFileProcessor(db, { checkHash: true });

// Parse files
await processor.processFile('/path/to/file1.ts');
await processor.processFile('/path/to/file2.ts');

// Later, reparse only changed files
await processor.processFile('/path/to/file1.ts'); // skipped if unchanged
await processor.processFile('/path/to/file2.ts'); // updated if changed

// Clean up stale files (e.g., deleted from project)
const currentFiles = ['/path/to/file1.ts', '/path/to/file2.ts'];
const removedFiles = processor.removeStaleFiles(currentFiles);
console.log(`Removed ${removedFiles.length} stale files`);
```

### Performance Benefits

With incremental updates enabled:
- **Skip unchanged files**: No parsing overhead for unmodified code
- **Fast hash comparison**: SHA-256 hashing is faster than full parsing
- **Atomic updates**: Transactions ensure consistency
- **Automatic cleanup**: CASCADE constraints maintain integrity

### Database Schema

The incremental update system uses three main tables:

**files**: Tracks parsed files and their content hashes
```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**entities**: Stores extracted code entities
```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  language TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

**relationships**: Links entities with CASCADE deletion
```sql
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT,
  FOREIGN KEY (source_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
);
```

## API Reference

### FileProcessor

#### `createFileProcessor(db: Database, options?: FileProcessorOptions): FileProcessor`

Creates a file processor for parsing and storing code entities.

**Options:**
- `checkHash?: boolean` - Enable incremental updates (default: false)

**Returns:**
- `processFile(filePath: string): Promise<ProcessFileResult>` - Parse a file
- `removeStaleFiles(currentPaths: string[]): IncrementalUpdateResult[]` - Remove files not in list

### IncrementalUpdater

#### `createIncrementalUpdater(db: Database): IncrementalUpdater`

Low-level API for incremental update operations.

**Methods:**
- `shouldReparse(filePath: string, currentHash: string): boolean` - Check if reparse needed
- `markFileUpdated(filePath: string, contentHash: string, language: string): FileRecord` - Update file record
- `deleteFile(filePath: string): IncrementalUpdateResult` - Remove file and entities
- `removeStaleFiles(currentPaths: string[]): IncrementalUpdateResult[]` - Bulk remove

### Hash Utilities

#### `computeFileHash(content: string): string`

Compute SHA-256 hash of file content.

#### `computeFileHashFromPath(filePath: string): Promise<string | null>`

Read file and compute its hash. Returns null if file doesn't exist.

## Testing

See `/packages/core/src/parser/__tests__/incremental-integration.test.ts` for comprehensive integration tests covering:
- File content hashing
- Change detection
- Entity management
- Relationship CASCADE
- Stale file cleanup
- Multi-file workflows
