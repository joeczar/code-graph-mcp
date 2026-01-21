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

### Available Tools

| Tool | Description |
|------|-------------|
| `ping` | Test connectivity (returns "pong") |
| `echo` | Echo back a message (for testing) |
| `graph_status` | Show graph stats (entities, relationships) and parsed files |
| `what_calls` | Find all callers of a given entity |
| `what_does_call` | Find all entities called by a given entity |
| `blast_radius` | Analyze impact of changes to a file |
| `find_entity` | Search entities by name, type, or file path |
| `get_exports` | List all exported entities from a file |

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
