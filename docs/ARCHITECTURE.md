# Code Graph MCP - Architecture

How the unified memory system works.

## Package Structure

```
code-graph-mcp/
├── packages/
│   ├── core/                 # Graph engine, parsing, storage
│   │   ├── src/
│   │   │   ├── graph/        # Entity/relationship storage & queries
│   │   │   ├── parser/       # Tree-sitter walkers per language
│   │   │   ├── docs/         # Documentation extraction
│   │   │   ├── knowledge/    # Learning storage & LLM extraction
│   │   │   ├── checkpoint/   # Workflow state management
│   │   │   └── search/       # Semantic search, embeddings
│   │   └── package.json
│   │
│   ├── mcp-server/           # MCP tool definitions
│   │   ├── src/
│   │   │   ├── tools/        # Individual tool handlers
│   │   │   └── server.ts     # MCP server setup
│   │   └── package.json
│   │
│   └── cli/                  # Command-line interface
│       ├── src/
│       │   ├── commands/     # parse, query, watch, etc.
│       │   └── hooks/        # session-start, session-end
│       └── package.json
│
├── pnpm-workspace.yaml
└── package.json
```

**Dependencies flow one way:** `cli` → `mcp-server` → `core`

## MCP Composability

This server is designed to be **one tool among many**. MCP's architecture enables composition:

```
Claude Code (or any MCP client)
    │
    ├── code-graph-mcp        ← Our server (structure, persistence)
    ├── filesystem-mcp        ← File operations
    ├── github-mcp            ← Issue/PR management
    └── [other servers]       ← Future tools
```

**Design principle**: Don't try to do everything. Focus on pre-computed structure and cross-session memory. Let other servers (or the model itself) handle:

- Raw file exploration
- Arbitrary code execution
- RLM-style dynamic context management

The model orchestrates; we provide fast, persistent answers to anticipated questions.

## The Core Insight

Everything is a node. Everything connects.

```
┌─────────────────────────────────────────────────────────────────┐
│                      UNIFIED GRAPH                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    calls     ┌──────────┐                       │
│   │ Function │─────────────▶│ Function │                       │
│   │ validate │              │ encrypt  │                       │
│   └────┬─────┘              └────┬─────┘                       │
│        │                         │                              │
│        │ documented_by           │ learned_about                │
│        ▼                         ▼                              │
│   ┌──────────┐              ┌──────────┐                       │
│   │   Doc    │              │ Learning │                       │
│   │ "Checks  │              │ "Always  │                       │
│   │  expiry" │              │  check   │                       │
│   └──────────┘              │  key     │                       │
│                             │  length" │                       │
│                             └────┬─────┘                       │
│                                  │                              │
│                                  │ discovered_in                │
│                                  ▼                              │
│                             ┌──────────┐                       │
│                             │ Workflow │                       │
│                             │ #142     │                       │
│                             └──────────┘                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Types

All stored in one graph, queryable together.

### Code Entities (from tree-sitter)
| Entity | Description | Extracted From |
|--------|-------------|----------------|
| `File` | Source file | File system |
| `Function` | Function/method | AST |
| `Class` | Class definition | AST |
| `Module` | Module/namespace | AST |
| `Type` | Type/interface | AST |
| `Variable` | Exported constant | AST |

### Documentation Entities
| Entity | Description | Extracted From |
|--------|-------------|----------------|
| `InlineDoc` | JSDoc, RDoc, docstring | AST comments |
| `ReadmeSection` | Markdown heading + content | README parsing |
| `ExternalDoc` | Fetched spec/reference | URL fetch |

### Knowledge Entities
| Entity | Description | Extracted From |
|--------|-------------|----------------|
| `Learning` | Insight about code | LLM extraction from commits/conversations |
| `Pattern` | Reusable approach | LLM extraction |
| `Mistake` | Error + fix | LLM extraction |
| `Decision` | Why something was done | LLM extraction |

### Workflow Entities
| Entity | Description | Extracted From |
|--------|-------------|----------------|
| `Workflow` | Issue-based work session | Checkpoint system |
| `Commit` | Git commit made | Git log |
| `Phase` | Workflow stage | State machine |

## Relationships

How entities connect across concerns.

### Code → Code
- `calls` - Function calls function
- `imports` - File imports from file
- `extends` - Class extends class
- `implements` - Class implements type
- `contains` - File contains function

### Code → Documentation
- `documented_by` - Function has inline doc
- `described_in` - Module described in README section
- `references` - Doc links to external spec

### Code → Knowledge
- `learned_about` - Learning applies to function/file
- `pattern_for` - Pattern applies to code area
- `mistake_in` - Mistake was made in file

### Knowledge → Workflow
- `discovered_in` - Learning found during workflow
- `applied_in` - Pattern used in workflow

### Workflow → Code
- `modified` - Workflow changed file
- `committed` - Workflow created commit touching files

## Query Examples

The power is in cross-concern queries.

### "What do I know about authentication?"

```sql
-- Find code entities matching "auth"
SELECT * FROM entities
WHERE type IN ('Function', 'Class', 'File')
AND name LIKE '%auth%'

-- Find learnings linked to those entities
SELECT l.* FROM entities l
JOIN relationships r ON r.target_id = l.id
WHERE r.source_id IN (above results)
AND l.type = 'Learning'

-- Find docs for those entities
SELECT d.* FROM entities d
JOIN relationships r ON r.target_id = d.id
WHERE r.source_id IN (code results)
AND r.type = 'documented_by'
```

Result: Functions + their docs + learnings about them, in one answer.

### "What's the blast radius of changing auth/validate.ts?"

```sql
-- Find the file
SELECT id FROM entities WHERE type = 'File' AND path = 'auth/validate.ts'

-- Find what it exports
SELECT target_id FROM relationships
WHERE source_id = (file_id) AND type = 'contains'

-- Find what calls those exports (recursive)
WITH RECURSIVE callers AS (
  SELECT source_id FROM relationships
  WHERE target_id IN (exports) AND type = 'calls'
  UNION
  SELECT r.source_id FROM relationships r
  JOIN callers c ON r.target_id = c.source_id
  WHERE r.type = 'calls'
)
SELECT * FROM entities WHERE id IN (SELECT source_id FROM callers)

-- Also get: learnings about affected code, past mistakes in those files
```

### "Resume my work on issue #142"

```sql
-- Find workflow
SELECT * FROM entities WHERE type = 'Workflow' AND issue_number = 142

-- Get current phase
SELECT phase, status FROM workflow_state WHERE workflow_id = (above)

-- Get commits made (for context)
SELECT * FROM entities e
JOIN relationships r ON e.id = r.target_id
WHERE r.source_id = (workflow_id) AND r.type = 'committed'

-- Get learnings discovered during this work
SELECT * FROM entities e
JOIN relationships r ON e.id = r.target_id
WHERE r.source_id = (workflow_id) AND r.type = 'discovered_in'
```

Result: Know where you left off + what you learned along the way.

## Data Flow

### 1. Indexing (on setup / file change)

```
Source Files
    │
    ▼
┌─────────────┐
│ Tree-sitter │──▶ Code Entities + Relationships
└─────────────┘
    │
    ▼
┌─────────────┐
│   Comment   │──▶ InlineDoc Entities + documented_by relationships
│   Parser    │
└─────────────┘
    │
    ▼
┌─────────────┐
│   README    │──▶ ReadmeSection Entities + described_in relationships
│   Parser    │
└─────────────┘
    │
    ▼
   SQLite
```

### 2. Learning Capture (on commit / session end)

```
Git Commits + Conversation
    │
    ▼
┌─────────────┐
│     LLM     │──▶ Learning/Pattern/Mistake Entities
│  Extractor  │
└─────────────┘
    │
    ▼
┌─────────────┐
│   Linker    │──▶ learned_about relationships (connects to code)
└─────────────┘
    │
    ▼
   SQLite
```

### 3. Workflow Tracking (during work)

```
Agent Actions
    │
    ▼
┌─────────────┐
│ Checkpoint  │──▶ Workflow Entity + phase updates
│   System    │
└─────────────┘
    │
    ├──▶ Commit logged ──▶ committed relationship
    │
    ├──▶ Learning found ──▶ discovered_in relationship
    │
    └──▶ File modified ──▶ modified relationship
```

### 4. Query (MCP tools)

```
Claude asks: "What calls validateToken?"
    │
    ▼
┌─────────────┐
│  MCP Tool   │
│  what_calls │
└─────────────┘
    │
    ▼
┌─────────────┐
│   Graph     │──▶ Traverse calls relationships
│   Query     │──▶ Include learnings about results
└─────────────┘
    │
    ▼
Formatted response with code + context
```

## MCP Tools

What Claude can ask the graph.

### Code Structure
| Tool | Description |
|------|-------------|
| `what_calls` | Find all callers of a function |
| `what_does_call` | Find all functions called by X |
| `blast_radius` | Impact analysis for a file/function |
| `find_entity` | Search by name/type |
| `get_exports` | List exports of a file |

### Documentation
| Tool | Description |
|------|-------------|
| `get_docs` | Get docs for a code entity |
| `search_docs` | Semantic search across all docs |
| `explain` | Get docs + learnings + context for entity |

### Knowledge
| Tool | Description |
|------|-------------|
| `recall` | Get learnings relevant to current context |
| `store_learning` | Save new learning with code links |
| `get_patterns` | Patterns for a code area |
| `get_mistakes` | Past mistakes in area (avoid repeating) |

### Workflow
| Tool | Description |
|------|-------------|
| `get_workflow` | Current workflow state |
| `set_phase` | Update workflow phase |
| `log_commit` | Record commit made |
| `resume` | Get full context to resume work |

## Session Lifecycle

### Session Start
1. Check for active workflow → prompt to resume
2. Parse branch name for issue context
3. Build warmup:
   - Active workflow state
   - Relevant learnings for context
   - Tool instructions (HOW to query, not data dump)

### During Work
1. Workflow tracks phase transitions
2. Commits logged automatically
3. Learnings captured from conversation

### Session End / Compaction
1. LLM extracts learnings from session
2. Links learnings to code entities touched
3. Workflow state persisted for resume

## Storage Schema

Single SQLite database with unified entity-relationship model.

```sql
-- All entities in one table
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- 'Function', 'Learning', 'Workflow', etc.
  name TEXT,
  content TEXT,        -- For docs/learnings
  metadata JSON,       -- Type-specific data
  embedding BLOB,      -- For semantic search
  created_at INTEGER,
  updated_at INTEGER
);

-- All relationships in one table
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'calls', 'documented_by', 'learned_about', etc.
  metadata JSON,
  created_at INTEGER,
  FOREIGN KEY (source_id) REFERENCES entities(id),
  FOREIGN KEY (target_id) REFERENCES entities(id)
);

-- Indexes for fast traversal
CREATE INDEX idx_rel_source ON relationships(source_id, type);
CREATE INDEX idx_rel_target ON relationships(target_id, type);
CREATE INDEX idx_entity_type ON entities(type);
CREATE INDEX idx_entity_name ON entities(name);
```

## Checkpoint System

The checkpoint system enables workflow resume after context compaction.

### Location

```
.claude/execution-state.db    # SQLite database (gitignored)
```

### Schema

```sql
-- Workflow tracking
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  issue_number INTEGER NOT NULL UNIQUE,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',  -- running, paused, completed, failed
  current_phase TEXT NOT NULL DEFAULT 'setup',  -- setup, research, implement, review, finalize
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Action log
CREATE TABLE workflow_actions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  action_type TEXT NOT NULL,  -- workflow_started, dev_plan_created, pr_created, etc.
  status TEXT NOT NULL,       -- success, failed, skipped
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

-- Commit log
CREATE TABLE workflow_commits (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  sha TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);
```

### CLI Commands

```bash
# Workflow management
pnpm checkpoint workflow create <issue_number> <branch_name>
pnpm checkpoint workflow find <issue_number>
pnpm checkpoint workflow get <workflow_id>
pnpm checkpoint workflow list [--status=running]
pnpm checkpoint workflow set-phase <workflow_id> <phase>
pnpm checkpoint workflow set-status <workflow_id> <status>

# Logging
pnpm checkpoint workflow log-action <workflow_id> <action_type> <status>
pnpm checkpoint workflow log-commit <workflow_id> <sha> <message>

# Cleanup
pnpm checkpoint workflow delete <workflow_id>
```

### Integration with Agents

Each agent in the `/work-on-issue` workflow receives and uses the `workflow_id`:

1. **setup-agent**: Creates workflow, outputs `workflow_id`
2. **issue-researcher**: Logs plan creation
3. **atomic-developer**: Logs each commit
4. **finalize-agent**: Logs PR creation, marks complete

See `.claude/skills/checkpoint-workflow/SKILL.md` for full reference.

---

## Known Limitations

### Rails Association Singularization

The Ruby parser extracts Rails ActiveRecord associations (`has_many`, `has_one`, `belongs_to`, `has_and_belongs_to_many`) as relationships. For plural associations, it infers the target model name by singularizing the association name.

**Current approach**: Naive singularization (removes trailing 's')

This handles ~98% of associations but fails for irregular English plurals:

| Association | Naive Result | Correct |
|-------------|--------------|---------|
| `has_many :companies` | Companie | Company |
| `has_many :localities` | Localitie | Locality |
| `has_many :categories` | Categorie | Category |
| `has_many :statuses` | Statuse | Status |
| `has_many :people` | Peopl | Person |

**Why not use Rails Inflector?**

This is a static analysis tool that runs outside Rails. Pulling in ActiveSupport just for singularization adds significant dependency weight. The naive approach provides good coverage for most codebases.

**Impact analysis (fobizz-rails)**: 3 of 170 associations affected (1.8%)

**Workaround**: Use explicit `class_name` option in Rails:
```ruby
has_many :companies, class_name: "Company"
has_many :localities, class_name: "Locality"
```

The extractor correctly reads `class_name` and uses it instead of inference.

**Future enhancement**: Could add common irregular plural rules (`-ies→-y`, `-es→-e` for specific patterns) if real-world usage shows significant impact.

See: `packages/core/src/parser/extractors/ruby-relationships.ts:inferModelName()`

---

*This is a conceptual architecture. Implementation details will evolve.*
