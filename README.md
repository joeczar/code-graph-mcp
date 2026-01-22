# Code Graph MCP

A unified MCP server providing a knowledge graph for code, documentation, and learnings. Built for Claude Code integration.

## Overview

AI coding assistants suffer from amnesia. Every context compaction erases what code exists, how it connects, and what was learned. Code Graph MCP solves this by maintaining a unified knowledge graph spanning code structure, documentation, and persistent learnings.

See [docs/VISION.md](docs/VISION.md) for the full vision.

## Installation

### Prerequisites

- Node.js 22+
- pnpm 9+

### Setup

```bash
# Clone the repository
git clone https://github.com/joeczar/code-graph-mcp.git
cd code-graph-mcp

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Usage with Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "node",
      "args": ["path/to/code-graph-mcp/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Or add to your global Claude settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "node",
      "args": ["/absolute/path/to/code-graph-mcp/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Code after adding the configuration.

### Quick Start

After installation and configuration:

1. **Verify connection** - The `ping` tool should return "pong"
2. **Parse your codebase**:
   ```
   mcp__code-graph__parse_directory with path: "/path/to/your/project"
   ```
3. **Check the graph**:
   ```
   mcp__code-graph__graph_status
   ```
4. **Query the graph**:
   ```
   mcp__code-graph__find_entity with namePattern: "MyClass"
   mcp__code-graph__blast_radius with filePath: "/path/to/file.ts"
   ```

## Configuration

### Project ID

The server automatically identifies your project using the following detection methods (in order):

1. **Environment Variable** (explicit configuration)
   ```json
   {
     "mcpServers": {
       "code-graph": {
         "command": "node",
         "args": ["path/to/code-graph-mcp/packages/mcp-server/dist/index.js"],
         "env": {
           "PROJECT_ID": "my-project"
         }
       }
     }
   }
   ```

2. **Git Remote Origin URL** (automatic detection)
   - Extracts repository name from `git config --get remote.origin.url`
   - Supports SSH and HTTPS formats (e.g., `git@github.com:owner/repo.git` and `https://github.com/owner/repo` both result in `repo`)

3. **package.json Name** (automatic detection)
   - Reads the `name` field from `package.json` in the current directory
   - Strips `@scope/` prefix for scoped packages: `@myorg/my-package` → `my-package`

4. **Fallback to 'unknown'** if all detection methods fail

The project ID is used to distinguish metrics and data between different codebases when using the same server instance.

### Available Tools

| Tool | Description |
|------|-------------|
| `ping` | Test connectivity (returns "pong") |
| `echo` | Echo back a message (for testing) |
| `graph_status` | Show graph stats (entities, relationships) and parsed files |
| `parse_file` | Parse a single file into the graph |
| `parse_directory` | Parse all files in a directory recursively |
| `find_entity` | Search entities by name, type, or file path |
| `get_exports` | List all exported entities from a file |
| `what_calls` | Find all callers of a given entity |
| `what_does_call` | Find all entities called by a given entity |
| `blast_radius` | Analyze impact of changes to a file |

### Supported Languages

| Language | Extensions | Entity Extraction | Relationships |
|----------|------------|-------------------|---------------|
| TypeScript | `.ts`, `.tsx` | ✅ Functions, classes, methods | ✅ extends |
| JavaScript | `.js`, `.jsx` | ✅ Functions, classes, methods | ✅ extends |
| Ruby | `.rb` | ✅ Functions, classes, methods, modules | ✅ extends |
| Vue | `.vue` | ✅ Functions, classes, methods | ✅ extends |

> **Note:** Function call relationships (`calls`) are not yet extracted. See [#132](https://github.com/joeczar/code-graph-mcp/issues/132) for progress.

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm typecheck        # TypeScript type checking
pnpm lint             # ESLint
```

## Project Structure

```
packages/
  core/              # Graph storage, parsing, queries
  mcp-server/        # MCP server with stdio transport
  cli/               # CLI for hooks and management
```

## License

MIT
