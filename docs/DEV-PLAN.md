# Code Graph MCP - Development Plan

PRs target ~500 lines or less. Each issue is a shippable increment.

---

## Milestone 1: Foundation ✅

Get tree-sitter working, basic project structure, database schema.

### Epic 1.1: Project Setup
| Issue | Description | Est. Lines | Status |
|-------|-------------|------------|--------|
| 1.1.1 | Init monorepo: pnpm workspace, packages/core scaffold | ~150 | ✅ |
| 1.1.2 | TypeScript, ESLint, Vitest shared config | ~200 | ✅ |
| 1.1.3 | Add tree-sitter + TypeScript grammar to core, verify parsing | ~200 | ✅ |
| 1.1.4 | Add tree-sitter-ruby grammar, verify parsing works | ~150 | ✅ |

### Epic 1.2: Database Foundation
| Issue | Description | Est. Lines | Status |
|-------|-------------|------------|--------|
| 1.2.1 | SQLite setup with better-sqlite3, connection management | ~200 | ✅ |
| 1.2.2 | Entities table + CRUD operations | ~300 | ✅ |
| 1.2.3 | Relationships table + CRUD operations | ~300 | ✅ |
| 1.2.4 | Basic indexes, migration system | ~200 | ✅ |

**Milestone 1 Exit Criteria:**
- [x] `pnpm test` passes
- [x] Can parse TS and Ruby files with tree-sitter
- [x] Can store/retrieve entities and relationships

---

## Milestone 2: MCP Server Foundation

Scaffold MCP server and establish tool patterns. Build tools alongside features.

### Epic 2.1: MCP Setup
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 2.1.1 | Create packages/mcp-server with @modelcontextprotocol/sdk | ~250 |
| 2.1.2 | Tool registration pattern, input validation with Zod | ~200 |
| 2.1.3 | Error handling, response formatting | ~200 |
| 2.1.4 | Server startup, stdio transport | ~150 |

### Epic 2.2: Core Infrastructure Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 2.2.1 | `graph_status` tool - show DB stats, parsed files | ~150 |
| 2.2.2 | `parse_file` tool - parse single file into graph | ~200 |
| 2.2.3 | `parse_directory` tool - parse directory recursively | ~250 |

**Milestone 2 Exit Criteria:**
- [ ] MCP server starts, tools registered
- [ ] Can parse files via MCP tool calls
- [ ] Claude Code can connect and call tools

---

## Milestone 3: Code Graph

Extract code structure from source files.

### Epic 3.1: Tree-sitter Walker
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.1.1 | AST walker base class, node visitor pattern | ~300 |
| 3.1.2 | TypeScript entity extraction (functions, classes, types) | ~400 |
| 3.1.3 | TypeScript relationship extraction (calls, imports) | ~400 |
| 3.1.4 | Ruby entity extraction (methods, classes, modules) | ~400 |
| 3.1.5 | Ruby relationship extraction (calls, requires) | ~400 |

### Epic 3.2: Code Graph Store
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.2.1 | Parse single file → store entities/relationships | ~300 |
| 3.2.2 | Parse directory recursively, respect .gitignore | ~250 |
| 3.2.3 | Incremental update: detect changed files, reparse | ~350 |

### Epic 3.3: Code Graph Queries
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.3.1 | `whatCalls(name)` - find callers | ~200 |
| 3.3.2 | `whatDoesCall(name)` - find callees | ~150 |
| 3.3.3 | `blastRadius(file)` - recursive impact analysis | ~300 |
| 3.3.4 | `findEntity(query)` - search by name/type | ~200 |
| 3.3.5 | `getExports(file)` - list file exports | ~150 |

### Epic 3.4: Code Graph MCP Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.4.1 | `what_calls`, `what_does_call` tools | ~200 |
| 3.4.2 | `blast_radius`, `find_entity` tools | ~200 |
| 3.4.3 | `get_exports` tool | ~100 |

**Milestone 3 Exit Criteria:**
- [x] Can parse a mixed TS/Ruby codebase
- [x] Can answer "what calls X?" accurately via MCP
- [x] Incremental updates work (change file, graph updates)

---

## Milestone 4: Documentation

Extract and link docs to code.

### Epic 4.1: Inline Doc Extraction
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 4.1.1 | Extract JSDoc/TSDoc comments from TS AST | ~300 |
| 4.1.2 | Extract RDoc/YARD comments from Ruby AST | ~300 |
| 4.1.3 | Create InlineDoc entities, link with `documented_by` | ~250 |

### Epic 4.2: README Parsing
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 4.2.1 | Parse markdown into sections (heading + content) | ~250 |
| 4.2.2 | Create ReadmeSection entities | ~150 |
| 4.2.3 | Link sections to files/modules via `described_in` | ~200 |

### Epic 4.3: Doc MCP Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 4.3.1 | `get_docs` - get docs for code entity | ~150 |
| 4.3.2 | `search_docs` - text search across docs | ~200 |

**Milestone 4 Exit Criteria:**
- [ ] Inline docs attached to functions/classes
- [ ] README sections linked to modules
- [ ] Can query: "show me docs for validateToken" via MCP

---

## Milestone 5: Knowledge Graph

Persist learnings across sessions.

### Epic 5.1: Knowledge Storage
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 5.1.1 | Learning entity type + store/retrieve | ~250 |
| 5.1.2 | Pattern, Mistake, Decision entity types | ~300 |
| 5.1.3 | Link knowledge to code via `learned_about` | ~200 |

### Epic 5.2: LLM Extraction
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 5.2.1 | Commit message → learning extraction prompt | ~300 |
| 5.2.2 | Conversation → learning extraction prompt | ~300 |
| 5.2.3 | LLM client abstraction (OpenAI/Anthropic/local) | ~350 |
| 5.2.4 | Auto-link extracted learnings to code entities | ~250 |

### Epic 5.3: Knowledge MCP Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 5.3.1 | `recall` - get relevant learnings for context | ~250 |
| 5.3.2 | `store_learning` - manually store a learning | ~200 |
| 5.3.3 | `get_patterns`, `get_mistakes` - by code area | ~150 |

**Milestone 5 Exit Criteria:**
- [ ] Can store learnings linked to code
- [ ] LLM extracts learnings from commits
- [ ] Can query: "what have I learned about auth?" via MCP

---

## Milestone 6: Semantic Search

Find things by meaning, not just text.

### Epic 6.1: Embeddings
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 6.1.1 | Embedding generation abstraction | ~200 |
| 6.1.2 | OpenAI embeddings provider | ~200 |
| 6.1.3 | Local embeddings provider (transformers.js or similar) | ~300 |
| 6.1.4 | Store embeddings in entity blob column | ~150 |

### Epic 6.2: Semantic MCP Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 6.2.1 | Cosine similarity search over embeddings | ~200 |
| 6.2.2 | Hybrid search: text + semantic ranking | ~300 |
| 6.2.3 | `semantic_search` - unified search tool | ~250 |

**Milestone 6 Exit Criteria:**
- [ ] Can embed entities on store
- [ ] Semantic search returns relevant results
- [ ] "authentication flow" finds auth code even without exact match

---

## Milestone 7: Workflow Checkpoint

Track and resume work across sessions.

### Epic 7.1: Workflow State
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 7.1.1 | Workflow entity type + create/find/update | ~300 |
| 7.1.2 | Phase state machine (research → implement → review → done) | ~200 |
| 7.1.3 | Log commits with `committed` relationship | ~200 |

### Epic 7.2: Workflow MCP Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 7.2.1 | `get_workflow`, `set_phase` tools | ~200 |
| 7.2.2 | `log_commit` tool | ~150 |
| 7.2.3 | `resume` - build full context for resumption | ~350 |

**Milestone 7 Exit Criteria:**
- [ ] Can create workflow, track phases
- [ ] Can resume workflow with full context via MCP
- [ ] Learnings linked to workflows that discovered them

---

## Milestone 8: Session Hooks & CLI

Automatic warmup and learning capture.

### Epic 8.1: CLI Package
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 8.1.1 | Create packages/cli with commander.js | ~200 |
| 8.1.2 | `code-graph init` - initialize DB for project | ~150 |
| 8.1.3 | `code-graph parse` - parse codebase | ~150 |

### Epic 8.2: Session Hooks
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 8.2.1 | `code-graph session-start` - warmup hook | ~300 |
| 8.2.2 | Detect active workflow, build resume prompt | ~250 |
| 8.2.3 | `code-graph session-end` - capture learnings | ~300 |

### Epic 8.3: File Watching
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 8.3.1 | Watch mode: detect file changes | ~250 |
| 8.3.2 | Incremental reparse on change | ~200 |

**Milestone 8 Exit Criteria:**
- [ ] CLI can initialize and parse projects
- [ ] Session start provides useful context
- [ ] Session end captures learnings automatically
- [ ] Graph stays updated as files change

---

## Summary

| Milestone | Focus | Issues |
|-----------|-------|--------|
| 1. Foundation ✅ | Monorepo, DB, tree-sitter | 8 |
| 2. MCP Server Foundation | Server scaffold, basic tools | 7 |
| 3. Code Graph | Parse code, queries, MCP tools | 14 |
| 4. Documentation | Extract & link docs | 8 |
| 5. Knowledge | Learnings, LLM extraction | 10 |
| 6. Semantic Search | Embeddings, hybrid search | 6 |
| 7. Checkpoint | Workflow state, resume | 6 |
| 8. Session Hooks | CLI, warmup/capture | 8 |
| **Total** | | **67** |

---

## Development Phases

### Phase A: Usable Code Graph (M1 ✅ + M2 + M3)
- Foundation + MCP Server + Code Graph
- First usable product: "what calls X?" via Claude
- 🐕 **Dog-food A**: Use on code-graph-mcp itself

### Phase B: Add Documentation (M4)
- Docs linked to code
- Queries return code + docs together
- 🐕 **Dog-food B**: Use on a Ruby project

### Phase C: Add Knowledge (M5 + M6)
- Learning persistence, LLM extraction
- Semantic search across everything
- 🐕 **Dog-food C**: Capture learnings while building Phase D

### Phase D: Add Workflow (M7 + M8)
- Checkpoint system, session hooks
- Full memory system complete
- 🐕 **Dog-food D**: Full system on a multi-session project

---

*Estimates are rough. Actual complexity will vary.*
