# Code Graph MCP - Claude Instructions

## Project Overview

A unified MCP server providing a knowledge graph for code, documentation, and learnings. Built with Node.js + pnpm (tree-sitter native modules require Node.js).

## Tech Stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js 22+ |
| Package Manager | pnpm |
| Language | TypeScript (strict mode) |
| Testing | Vitest |
| Parsing | Tree-sitter |
| Database | SQLite (better-sqlite3) |
| Protocol | MCP (Model Context Protocol) |

## Commands

```bash
pnpm install          # Install dependencies
pnpm test            # Run tests (Vitest)
pnpm build           # Build all packages
pnpm lint            # ESLint
pnpm typecheck       # TypeScript type checking
```

## Project Structure

```
packages/
  core/              # Graph storage, parsing, queries
  mcp-server/        # MCP tool implementations
  cli/               # CLI for hooks and management
```

## Development Guidelines

### Code Style

- **Strict TypeScript** - No `any` except when interfacing with external libs
- **Small functions** - Max ~50 lines, single responsibility
- **Explicit types** - No implicit any, explicit return types on exports
- **Error handling** - Use Result pattern or explicit error types

### Testing

- **Test-first** - Write tests before implementation when possible
- **Vitest** - Use describe/it blocks, prefer `expect` assertions
- **Coverage** - Aim for high coverage on core logic
- **Integration tests** - Test actual tree-sitter parsing

### Commits

Use conventional commits:

```
feat(parser): add TypeScript class extraction
fix(db): handle concurrent writes correctly
test(queries): add blast radius edge cases
docs(readme): update installation instructions
```

### PRs

- Target ~500 lines or less
- One logical change per PR
- Include tests for new functionality
- Update relevant documentation

## Workflow System

This project uses a structured workflow system for development:

- **`/work-on-issue <number>`** - Start working on a GitHub issue
- Uses gated phases: Setup → Research → Implement → Review → Finalize
- Each phase requires approval before proceeding

### Agents

Located in `.claude/agents/`:
- `github-master.md` - GitHub operations patterns
- `setup-agent.md` - Branch creation, issue assignment
- `issue-researcher.md` - Codebase analysis, planning
- `atomic-developer.md` - Incremental implementation
- `finalize-agent.md` - PR creation, cleanup

### Shared Patterns

Located in `.claude/shared/`:
- `conventional-commits.md` - Commit message format
- `validation-commands.md` - Build/test/lint commands
- `escalation-patterns.md` - When to ask for help

## Current State

- **Milestone 0**: Setting up project infrastructure
- **Next**: Milestone 1 - Foundation (monorepo, tree-sitter, database)

## Key Design Decisions

1. **SQLite over graph DB** - Simpler, portable, atomic
2. **Tree-sitter for all parsing** - One framework, multiple languages
3. **pnpm workspaces** - Monorepo with separate packages
4. **Node.js over Bun** - Tree-sitter native modules compatibility

## Open Questions

See VISION.md for open design questions about:
- Embedding strategy (local vs API)
- Update strategy (full reparse vs incremental)
- Knowledge confidence handling
