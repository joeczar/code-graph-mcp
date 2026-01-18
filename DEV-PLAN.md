# Code Graph MCP - Development Plan

PRs target ~500 lines or less. Each issue is a shippable increment.

---

## Milestone 1: Foundation

Get tree-sitter working, basic project structure, database schema.

### Epic 1.1: Project Setup
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 1.1.1 | Init monorepo: pnpm workspace, packages/core scaffold | ~150 |
| 1.1.2 | TypeScript, ESLint, Vitest shared config | ~200 |
| 1.1.3 | Add tree-sitter + TypeScript grammar to core, verify parsing | ~200 |
| 1.1.4 | Add tree-sitter-ruby grammar, verify parsing works | ~150 |

### Epic 1.2: Database Foundation
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 1.2.1 | SQLite setup with better-sqlite3, connection management | ~200 |
| 1.2.2 | Entities table + CRUD operations | ~300 |
| 1.2.3 | Relationships table + CRUD operations | ~300 |
| 1.2.4 | Basic indexes, migration system | ~200 |

**Milestone 1 Exit Criteria:**
- [ ] `pnpm test` passes
- [ ] Can parse TS and Ruby files with tree-sitter
- [ ] Can store/retrieve entities and relationships

---

## Milestone 2: Code Graph

Extract code structure from source files.

### Epic 2.1: Tree-sitter Walker
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 2.1.1 | AST walker base class, node visitor pattern | ~300 |
| 2.1.2 | TypeScript entity extraction (functions, classes, types) | ~400 |
| 2.1.3 | TypeScript relationship extraction (calls, imports) | ~400 |
| 2.1.4 | Ruby entity extraction (methods, classes, modules) | ~400 |
| 2.1.5 | Ruby relationship extraction (calls, requires) | ~400 |

### Epic 2.2: Code Graph Store
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 2.2.1 | Parse single file → store entities/relationships | ~300 |
| 2.2.2 | Parse directory recursively, respect .gitignore | ~250 |
| 2.2.3 | Incremental update: detect changed files, reparse | ~350 |

### Epic 2.3: Code Graph Queries
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 2.3.1 | `whatCalls(name)` - find callers | ~200 |
| 2.3.2 | `whatDoesCall(name)` - find callees | ~150 |
| 2.3.3 | `blastRadius(file)` - recursive impact analysis | ~300 |
| 2.3.4 | `findEntity(query)` - search by name/type | ~200 |
| 2.3.5 | `getExports(file)` - list file exports | ~150 |

**Milestone 2 Exit Criteria:**
- [ ] Can parse a mixed TS/Ruby codebase
- [ ] Can answer "what calls X?" accurately
- [ ] Incremental updates work (change file, graph updates)

---

## Milestone 3: Documentation

Extract and link docs to code.

### Epic 3.1: Inline Doc Extraction
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.1.1 | Extract JSDoc/TSDoc comments from TS AST | ~300 |
| 3.1.2 | Extract RDoc/YARD comments from Ruby AST | ~300 |
| 3.1.3 | Create InlineDoc entities, link with `documented_by` | ~250 |

### Epic 3.2: README Parsing
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.2.1 | Parse markdown into sections (heading + content) | ~250 |
| 3.2.2 | Create ReadmeSection entities | ~150 |
| 3.2.3 | Link sections to files/modules via `described_in` | ~200 |

### Epic 3.3: Doc Queries
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 3.3.1 | `getDocs(entity)` - get docs for code entity | ~150 |
| 3.3.2 | `searchDocs(query)` - text search across docs | ~200 |

**Milestone 3 Exit Criteria:**
- [ ] Inline docs attached to functions/classes
- [ ] README sections linked to modules
- [ ] Can query: "show me docs for validateToken"

---

## Milestone 4: Knowledge Graph

Persist learnings across sessions.

### Epic 4.1: Knowledge Storage
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 4.1.1 | Learning entity type + store/retrieve | ~250 |
| 4.1.2 | Pattern, Mistake, Decision entity types | ~300 |
| 4.1.3 | Link knowledge to code via `learned_about` | ~200 |

### Epic 4.2: LLM Extraction
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 4.2.1 | Commit message → learning extraction prompt | ~300 |
| 4.2.2 | Conversation → learning extraction prompt | ~300 |
| 4.2.3 | LLM client abstraction (OpenAI/Anthropic/local) | ~350 |
| 4.2.4 | Auto-link extracted learnings to code entities | ~250 |

### Epic 4.3: Knowledge Queries
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 4.3.1 | `recall(context)` - get relevant learnings | ~250 |
| 4.3.2 | `getPatterns(area)` - patterns for code area | ~150 |
| 4.3.3 | `getMistakes(area)` - past mistakes to avoid | ~150 |

**Milestone 4 Exit Criteria:**
- [ ] Can store learnings linked to code
- [ ] LLM extracts learnings from commits
- [ ] Can query: "what have I learned about auth?"

---

## Milestone 5: Semantic Search

Find things by meaning, not just text.

### Epic 5.1: Embeddings
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 5.1.1 | Embedding generation abstraction | ~200 |
| 5.1.2 | OpenAI embeddings provider | ~200 |
| 5.1.3 | Local embeddings provider (transformers.js or similar) | ~300 |
| 5.1.4 | Store embeddings in entity blob column | ~150 |

### Epic 5.2: Semantic Queries
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 5.2.1 | Cosine similarity search over embeddings | ~200 |
| 5.2.2 | Hybrid search: text + semantic ranking | ~300 |
| 5.2.3 | `semanticSearch(query)` - unified search tool | ~250 |

**Milestone 5 Exit Criteria:**
- [ ] Can embed entities on store
- [ ] Semantic search returns relevant results
- [ ] "authentication flow" finds auth code even without exact match

---

## Milestone 6: Workflow Checkpoint

Track and resume work across sessions.

### Epic 6.1: Workflow State
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 6.1.1 | Workflow entity type + create/find/update | ~300 |
| 6.1.2 | Phase state machine (research → implement → review → done) | ~200 |
| 6.1.3 | Log commits with `committed` relationship | ~200 |

### Epic 6.2: Resume Capability
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 6.2.1 | `resume(issue)` - build full context for resumption | ~350 |
| 6.2.2 | Link learnings discovered during workflow | ~200 |
| 6.2.3 | Link files modified during workflow | ~200 |

**Milestone 6 Exit Criteria:**
- [ ] Can create workflow, track phases
- [ ] Can resume workflow with full context
- [ ] Learnings linked to workflows that discovered them

---

## Milestone 7: MCP Server

Expose everything as Claude-callable tools.

### Epic 7.1: MCP Foundation
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 7.1.1 | MCP server setup with @modelcontextprotocol/sdk | ~250 |
| 7.1.2 | Tool registration pattern, input validation | ~200 |
| 7.1.3 | Error handling, response formatting | ~200 |

### Epic 7.2: Code Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 7.2.1 | `what_calls`, `what_does_call` tools | ~200 |
| 7.2.2 | `blast_radius`, `find_entity` tools | ~200 |
| 7.2.3 | `get_exports` tool | ~100 |

### Epic 7.3: Doc & Knowledge Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 7.3.1 | `get_docs`, `search_docs` tools | ~200 |
| 7.3.2 | `recall`, `store_learning` tools | ~250 |
| 7.3.3 | `get_patterns`, `get_mistakes` tools | ~150 |

### Epic 7.4: Workflow Tools
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 7.4.1 | `get_workflow`, `set_phase` tools | ~200 |
| 7.4.2 | `log_commit`, `resume` tools | ~250 |

**Milestone 7 Exit Criteria:**
- [ ] MCP server starts, tools registered
- [ ] Claude Code can call all tools
- [ ] End-to-end: parse repo → query via MCP

---

## Milestone 8: Session Hooks

Automatic warmup and learning capture.

### Epic 8.1: Session Start
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 8.1.1 | CLI command for session start hook | ~200 |
| 8.1.2 | Detect active workflow, build resume prompt | ~300 |
| 8.1.3 | Build warmup context (tools available, how to query) | ~250 |

### Epic 8.2: Session End
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 8.2.1 | CLI command for session end hook | ~200 |
| 8.2.2 | Extract learnings from recent commits | ~300 |
| 8.2.3 | Store learnings with code links | ~200 |

### Epic 8.3: File Watching
| Issue | Description | Est. Lines |
|-------|-------------|------------|
| 8.3.1 | Watch mode: detect file changes | ~250 |
| 8.3.2 | Incremental reparse on change | ~200 |

**Milestone 8 Exit Criteria:**
- [ ] Session start provides useful context
- [ ] Session end captures learnings automatically
- [ ] Graph stays updated as files change

---

## Summary

| Milestone | Epics | Issues | Focus |
|-----------|-------|--------|-------|
| 1. Foundation | 2 | 8 | Monorepo, DB, tree-sitter |
| 2. Code Graph | 3 | 13 | Parse code, queries |
| 3. Documentation | 3 | 7 | Extract & link docs |
| 4. Knowledge | 3 | 10 | Learnings, LLM extraction |
| 5. Semantic Search | 2 | 6 | Embeddings, hybrid search |
| 6. Checkpoint | 2 | 6 | Workflow state, resume |
| 7. MCP Server | 4 | 11 | Tools for Claude |
| 8. Session Hooks | 3 | 7 | Automatic warmup/capture |
| **Total** | **22** | **68** | |

---

## Suggested Order

**Phase A: Usable Code Graph (M1 + M2 + M7 partial)**
- Foundation + Code Graph + MCP tools for code queries
- First usable product: "what calls X?" via Claude
- 🐕 **Dog-food A**: Use on code-graph-mcp itself

**Phase B: Add Documentation (M3 + M7 partial)**
- Docs linked to code
- Queries return code + docs together
- 🐕 **Dog-food B**: Use on a Ruby project

**Phase C: Add Knowledge (M4 + M5 + M7 partial)**
- Learning persistence, LLM extraction
- Semantic search across everything
- 🐕 **Dog-food C**: Capture learnings while building Phase D

**Phase D: Add Workflow (M6 + M8)**
- Checkpoint system, session hooks
- Full memory system complete
- 🐕 **Dog-food D**: Full system on claude-knowledge refactor

---

## Dog-fooding Strategy

Each phase includes mandatory validation before moving on.

### 🐕 Dog-food A: Self-hosting (after Phase A)

**Target:** code-graph-mcp itself
**Duration:** 1 week of active use

| Validation | Success Criteria |
|------------|------------------|
| Parse self | All TS files indexed, no errors |
| what_calls works | Accurately finds callers in own codebase |
| blast_radius works | Shows correct impact for file changes |
| Use during dev | Actually use MCP tools while building Phase B |

**Exit gate:** Must use tools for ≥5 real queries during Phase B development

---

### 🐕 Dog-food B: Multi-language (after Phase B)

**Target:** A real Ruby project (pick one you maintain)
**Duration:** 1 week of active use

| Validation | Success Criteria |
|------------|------------------|
| Parse Ruby | Ruby files indexed alongside TS |
| Docs linked | Inline docs appear with code queries |
| Cross-language | Can query "what calls X" in mixed repo |
| Real usage | Use for actual work, not just testing |

**Exit gate:** Must answer ≥10 real questions via MCP during Phase C development

---

### 🐕 Dog-food C: Learning Capture (after Phase C)

**Target:** code-graph-mcp (capture learnings while building Phase D)
**Duration:** 2 weeks of active use

| Validation | Success Criteria |
|------------|------------------|
| Auto-extraction | Learnings extracted from commits automatically |
| Linked to code | Learnings reference actual functions/files |
| Recall works | "What do I know about X?" returns useful results |
| Semantic search | Finds related content without exact match |
| Knowledge grows | ≥20 learnings captured during Phase D dev |

**Exit gate:** Review captured learnings - are they actually useful?

---

### 🐕 Dog-food D: Full System (after Phase D)

**Target:** claude-knowledge package refactor
**Duration:** Full project (weeks)

| Validation | Success Criteria |
|------------|------------------|
| Session resume | Can resume work after context compaction |
| Warmup useful | Session start provides relevant context |
| Learning reuse | Past learnings influence current work |
| End-to-end | Full workflow: parse → work → learn → resume |

**Exit gate:** Successfully complete a multi-session project using full system

---

## Dog-food Issues

Add these as real issues in the backlog.

### After Milestone 2
| Issue | Description |
|-------|-------------|
| DF-A.1 | Index code-graph-mcp with itself |
| DF-A.2 | Document 5 real queries made during Phase B |
| DF-A.3 | Fix issues discovered during self-hosting |

### After Milestone 3
| Issue | Description |
|-------|-------------|
| DF-B.1 | Index [Ruby project] with code-graph-mcp |
| DF-B.2 | Document 10 real queries made during Phase C |
| DF-B.3 | Fix multi-language issues discovered |

### After Milestone 5
| Issue | Description |
|-------|-------------|
| DF-C.1 | Enable learning capture for Phase D development |
| DF-C.2 | Review captured learnings after 2 weeks |
| DF-C.3 | Fix knowledge quality issues discovered |

### After Milestone 8
| Issue | Description |
|-------|-------------|
| DF-D.1 | Use full system for claude-knowledge refactor |
| DF-D.2 | Retrospective: what worked, what didn't |
| DF-D.3 | Prioritize fixes based on real usage |

---

## Updated Summary

| Milestone | Epics | Issues | Dog-food |
|-----------|-------|--------|----------|
| 1. Foundation | 2 | 8 | - |
| 2. Code Graph | 3 | 13 | 🐕 A: Self-host |
| 3. Documentation | 3 | 7 | 🐕 B: Ruby project |
| 4. Knowledge | 3 | 10 | - |
| 5. Semantic Search | 2 | 6 | 🐕 C: Capture learnings |
| 6. Checkpoint | 2 | 6 | - |
| 7. MCP Server | 4 | 11 | - |
| 8. Session Hooks | 3 | 7 | 🐕 D: Full system |
| **Total** | **22** | **68 + 12 DF** | |

---

*Estimates are rough. Actual complexity will vary.*
