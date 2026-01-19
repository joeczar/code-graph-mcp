# @code-graph/mcp-server

MCP (Model Context Protocol) server for the code-graph project. Provides tools for code analysis, documentation queries, and knowledge graph operations.

## Overview

This package implements the MCP server that exposes code-graph functionality to Claude and other MCP clients. It uses a standardized tool registration pattern with Zod validation for type safety and runtime validation.

## Tool Registration Pattern

All tools follow a consistent pattern for registration and validation:

### 1. Define Tool with Zod Schema

Create a tool definition in `src/tools/` with:
- Zod schema for input validation
- TypeScript-inferred types from schema
- Handler function with validated input

```typescript
// src/tools/your-tool.ts
import { z } from 'zod';
import { type ToolDefinition } from './types.js';

// Define input schema
const yourToolInputSchema = z.object({
  param1: z.string().describe('Description of param1'),
  param2: z.number().optional().describe('Optional numeric parameter'),
});

// Export tool definition
export const yourTool: ToolDefinition<typeof yourToolInputSchema> = {
  metadata: {
    name: 'your-tool',
    description: 'Clear description of what this tool does',
    inputSchema: yourToolInputSchema,
  },

  handler: (input) => {
    // Input is fully typed from Zod schema
    // TypeScript knows input.param1 is string, input.param2 is number | undefined

    return {
      content: [
        {
          type: 'text',
          text: `Result: ${input.param1}`,
        },
      ],
    };
  },
};
```

### 2. Write Tests

Create tests in `src/tools/__tests__/your-tool.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { yourTool } from '../your-tool.js';

describe('yourTool', () => {
  describe('metadata', () => {
    it('should validate correct input', () => {
      const result = yourTool.metadata.inputSchema.safeParse({
        param1: 'test',
        param2: 42,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid input', () => {
      const result = yourTool.metadata.inputSchema.safeParse({
        param1: 123, // Should be string
      });
      expect(result.success).toBe(false);
    });
  });

  describe('handler', () => {
    it('should process valid input', () => {
      // Handler can be sync or async - await works for both
      const response = yourTool.handler({
        param1: 'test',
        param2: 42,
      });

      expect(response.content[0]?.text).toContain('test');
    });
  });
});
```

### 3. Register Tool in Server

Add tool registration to `src/server.ts`:

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';
import { yourTool } from './tools/your-tool.js';

// In createServer():
server.registerTool(
  yourTool.metadata.name,
  {
    title: yourTool.metadata.name,
    description: yourTool.metadata.description,
    // Generate JSON Schema from Zod schema - single source of truth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: zodToJsonSchema(yourTool.metadata.inputSchema) as any,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (params: any) => {
    try {
      // Validate with Zod
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const validated = yourTool.metadata.inputSchema.parse(params.params);
      // Call handler with validated input
      const result = await yourTool.handler(validated);
      return {
        ...result,
        content: result.content.map(item => ({ ...item, type: 'text' as const })),
      };
    } catch (error) {
      return createErrorResponse(error);
    }
  }
);
```

## Benefits of This Pattern

1. **Type Safety**: Zod schemas provide both runtime validation and TypeScript types
2. **Single Source of Truth**: Schema defines validation, types, and documentation
3. **Testability**: Tools can be tested independently from server registration
4. **Error Handling**: Standardized error responses via `createErrorResponse()`
5. **Discoverability**: All tools follow the same structure

## Available Tools

### ping
Simple connectivity test tool. Returns "pong" to verify server is responsive.
Defined inline in `server.ts` as it requires no validation.

### echo
Demonstration tool that echoes back a message. Useful as a template for new tools.

**Input:**
```json
{
  "message": "string"
}
```

**Output:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Echo: your message"
    }
  ]
}
```

## Development

### Adding a New Tool

1. Create `src/tools/my-tool.ts` with tool definition
2. Create `src/tools/__tests__/my-tool.test.ts` with tests
3. Register tool in `src/server.ts`
4. Export from `src/tools/index.ts`
5. Update this README with tool documentation

### Running Tests

```bash
pnpm test                    # Run all tests
pnpm test src/tools/my-tool  # Run specific tool tests
```

### Type Checking

```bash
pnpm typecheck
```

### Building

```bash
pnpm build
```

## Architecture

```
src/
├── tools/
│   ├── types.ts           # Shared types and utilities
│   ├── echo.ts            # Example tool
│   ├── index.ts           # Tool exports
│   └── __tests__/
│       ├── types.test.ts
│       └── echo.test.ts
├── server.ts              # MCP server setup and registration
├── server.test.ts
└── index.ts               # CLI entry point
```

## MCP Protocol

This server implements the [Model Context Protocol](https://modelcontextprotocol.io/) specification. Tools are exposed to MCP clients (like Claude Code) and can be invoked with validated parameters.

### Connection

The server runs over stdio transport and is typically configured in Claude Code's MCP settings:

```json
{
  "mcpServers": {
    "code-graph": {
      "command": "code-graph-mcp"
    }
  }
}
```

## Future Tools

Planned tools for code-graph functionality:
- `analyze-file`: Parse and extract entities from source files
- `query-dependencies`: Find dependencies and dependents
- `blast-radius`: Calculate impact of changes
- `search-knowledge`: Query knowledge graph
