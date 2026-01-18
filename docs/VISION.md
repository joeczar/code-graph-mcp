# Code Graph MCP - Vision

## The Problem

AI coding assistants suffer from amnesia. Every context compaction erases:
- What code exists and how it connects
- What was learned while working
- Where you are in a multi-step workflow
- What documentation says about the code

Existing tools solve pieces but not the whole:
- **CodeGraphContext**: Code structure, no learning persistence
- **Claude Context**: Semantic search, no relationships
- **Graphiti**: General memory, not code-aware

No tool provides a **unified memory system** where code, documentation, and learnings reinforce each other.

## The Solution

A single MCP server that maintains a **unified knowledge graph** spanning:

| Entity Type | Examples |
|-------------|----------|
| **Code** | Functions, classes, types, modules, files |
| **Documentation** | Inline docs, README sections, external specs |
| **Knowledge** | Learnings, patterns, mistakes, decisions |
| **Workflow** | Checkpoints, phases, commits made |

Connected by relationships: `calls`, `imports`, `documents`, `learned_from`, `applies_to`

## Core Capabilities

### 1. Understand Code Structure
- Parse code into entities and relationships
- Answer: "What calls this function?" "What's the blast radius of changing this file?"
- Live updates as code changes
- **Multi-language**: Same graph model, language-specific parsers

### 2. Attach Documentation to Code
- Inline docs (JSDoc, RDoc, docstrings) linked to code entities
- README sections linked to modules
- External specs linked by topic
- One search finds code + its documentation together

### 3. Persist Learnings Across Sessions
- LLM-extracted insights from commits and conversations
- Linked to specific code entities: "For `validate_token`, always check expiry first"
- Patterns and mistakes that prevent repeating errors

### 4. Recover Workflow State
- Track workflow phases (research → implement → review)
- Log commits for potential rollback
- Resume after context compaction without losing progress

## Multi-Language Architecture

```
┌─────────────────────────────────────────────────────┐
│                 UNIFIED GRAPH                        │
│         (language-agnostic entities)                │
│                                                     │
│   Function | Class | Module | File | Type           │
│   calls | imports | extends | implements            │
└──────────────────────┬──────────────────────────────┘
                       │
           ┌───────────▼───────────┐
           │     TREE-SITTER       │
           │  (unified parsing)    │
           └───────────┬───────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │   TS    │   │  Ruby   │   │ Python  │
   │ Grammar │   │ Grammar │   │ Grammar │
   └─────────┘   └─────────┘   └─────────┘
```

Tree-sitter provides one parsing interface for all languages. Each grammar emits the same entity/relationship types.

## Design Principles

1. **Unified, not integrated** - One graph, not separate systems bolted together
2. **Language-agnostic core** - Universal entity model, pluggable parsers
3. **Portable** - Works on any codebase with a supported parser
4. **Teach how, not what** - Warmup teaches how to query, doesn't dump content
5. **Justify every token** - Context is precious; earn inclusion
6. **SQLite-first** - Simple, atomic, easy backup, no coordination
7. **MCP-native** - First-class integration with Claude Code and compatible tools

## What Success Looks Like

After working on a codebase for a week:
- Ask "what do I know about authentication?" → get code entities + docs + learnings
- Resume after compaction → pick up exactly where you left off
- Change a core function → instantly see blast radius + relevant learnings
- New session → warmup includes relevant context without re-reading files
- Switch languages → same queries, same graph, different parser

## Scope

### v1 (Foundation)
- [ ] Language-agnostic entity/relationship model
- [ ] TypeScript/JavaScript parser
- [ ] Ruby parser
- [ ] Inline documentation extraction
- [ ] Knowledge store with LLM extraction
- [ ] Checkpoint system for workflow recovery
- [ ] Semantic search across all entity types
- [ ] MCP server with standard tools

### Future
- [ ] Python parser
- [ ] Go, Rust parsers
- [ ] README/Markdown parsing and linking
- [ ] External documentation fetching
- [ ] Cross-language relationship tracking (FFI, API calls)
- [ ] Visualization of the graph

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Runtime** | Node.js + pnpm | Tree-sitter native modules don't work with Bun |
| **Parsing** | Tree-sitter | One framework for all languages, mature ecosystem |
| **Structure** | Monorepo | Separate packages for core, MCP server, CLI |

## Open Questions

1. **Embedding strategy**: Local models vs API? Trade-offs?
2. **Graph storage**: SQLite tables vs graph DB (Neo4j, etc.)?
3. **Update strategy**: Full reparse vs incremental?
4. **Knowledge confidence**: How to handle conflicting or outdated learnings?

---

*This document guides research and design. It is not a specification.*
