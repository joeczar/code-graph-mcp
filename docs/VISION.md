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

## Relationship to RLMs and Context Management

### What Are Recursive Language Models (RLMs)?

RLMs are an inference-time scaffolding approach introduced by MIT researchers (Zhang, Kraska, Khattab) in late 2025. Instead of stuffing massive context into the model directly, RLMs:

1. Store context in a Python REPL as a string variable
2. Let the model write code to grep, slice, and explore the text
3. Spawn sub-LLM calls on relevant chunks
4. Aggregate results without polluting the main context

This allows handling 10M+ tokens while avoiding "context rot" (performance degradation as context grows).

### Why This Matters for Code Graph

RLMs and code-graph-mcp solve **adjacent but different problems**:

| Aspect | RLMs | Code Graph |
|--------|------|------------|
| **Problem solved** | Context rot within a session | Amnesia across sessions |
| **Approach** | Dynamic exploration at inference time | Pre-computed persistent structure |
| **Query flexibility** | Unlimited (any Python code) | Fixed (schema-defined queries) |
| **Setup cost** | Zero | Parse entire codebase |
| **Speed for known patterns** | Slow (re-discovers each time) | Fast (pre-computed, indexed) |
| **Persistence** | None | Full cross-session memory |

### Our Unique Value

**RLMs don't solve persistence.** When a session ends, everything discovered is lost. Our moat is:

- Learnings that survive sessions
- Patterns and mistakes that prevent repeating errors
- Workflow state for resumption after compaction

### Complementary, Not Competing

The graph makes **frequent, predictable queries** fast. RLMs enable **novel, unpredictable exploration**. Together:

```
Claude (or RLM scaffold)
    │
    ├── Known patterns → graph.whatCalls("X")     ← FAST (pre-computed)
    ├── Known patterns → graph.blastRadius("Y")   ← FAST (pre-computed)
    ├── Recall memory → graph.recall("auth")      ← PERSISTENT (survives sessions)
    │
    └── Novel questions → explore raw code        ← FLEXIBLE (when graph can't answer)
```

### Design Implications

1. **Stay focused**: Don't try to incorporate RLM capabilities. MCP provides composition—users can run multiple servers.

2. **Maximize callability**: Make graph queries useful to ANY context management approach—native Claude, RLMs, future paradigms.

3. **Persistence is the moat**: Context management approaches will evolve. Cross-session memory remains uniquely valuable.

4. **Schema humility**: The graph can only answer anticipated questions. Accept this limitation rather than over-engineering.

### Open Question: Graph-Guided Exploration

Future consideration: Could the graph *hint* where to explore?

```python
# Hypothetical: graph suggests starting points for novel queries
relevant_files = graph.suggest_files("authentication bug")
# Then exploration focuses there first
```

This could bridge structured queries and flexible exploration without coupling implementations.

## Open Questions

1. **Embedding strategy**: Local models vs API? Trade-offs?
2. **Graph storage**: SQLite tables vs graph DB (Neo4j, etc.)?
3. **Update strategy**: Full reparse vs incremental?
4. **Knowledge confidence**: How to handle conflicting or outdated learnings?

---

*This document guides research and design. It is not a specification.*
