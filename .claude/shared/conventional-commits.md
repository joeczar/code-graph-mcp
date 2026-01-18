# Conventional Commits

## Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Types

| Type | Use When |
|------|----------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semicolons, etc. |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `build` | Build system or external dependencies |
| `ci` | CI configuration changes |
| `chore` | Other changes that don't modify src/test |
| `revert` | Revert a previous commit |

## Scopes

Project-specific scopes:

| Scope | Area |
|-------|------|
| `core` | packages/core functionality |
| `mcp` | MCP server implementation |
| `cli` | CLI tool |
| `parser` | Tree-sitter parsing |
| `db` | Database/SQLite |
| `graph` | Graph operations |
| `docs` | Documentation entities |
| `knowledge` | Learning/knowledge store |
| `workflow` | Checkpoint/workflow system |
| `search` | Semantic search |

## Examples

```
feat(parser): add TypeScript class extraction

Extracts class declarations, methods, and properties from TypeScript AST.
Stores as Entity with type 'class' and relationships to contained methods.

Closes #12
```

```
fix(db): handle concurrent transaction conflicts

Use WAL mode and retry logic for better concurrent access.

Fixes #45
```

```
test(graph): add blast radius edge cases

- Circular dependency detection
- Cross-package references
- Missing file handling
```

## Breaking Changes

Use `!` after type/scope for breaking changes:

```
feat(mcp)!: rename tool from what_calls to find_callers

BREAKING CHANGE: Tool name changed from `what_calls` to `find_callers`
for consistency with other query tools.
```

## Co-authoring

Include when Claude helped:

```
feat(parser): add Ruby method extraction

Co-Authored-By: Claude <noreply@anthropic.com>
```
