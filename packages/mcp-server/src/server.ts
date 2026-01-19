import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { echoTool } from './tools/echo.js';
import { createErrorResponse } from './tools/types.js';

/**
 * Log an error with context for debugging
 */
function logToolError(toolName: string, error: unknown, params?: unknown): void {
  console.error(`[mcp-server] Tool "${toolName}" failed:`, {
    error: error instanceof Error ? error.stack ?? error.message : error,
    params,
  });
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'code-graph-mcp',
    version: '0.0.1',
  });

  // Register ping tool for connectivity testing
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Simple ping tool for testing connectivity',
      inputSchema: {},
    },
    () => {
      return {
        content: [{ type: 'text', text: 'pong' }],
      };
    }
  );

  // Register echo tool using the tool registration pattern
  server.registerTool(
    echoTool.metadata.name,
    {
      title: echoTool.metadata.name,
      description: echoTool.metadata.description,
      // Use plain object schema - MCP SDK expects JSON Schema format
      // MCP SDK has strict types that don't match JSON Schema well
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The message to echo back',
          },
        },
        required: ['message'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    },
    // MCP SDK handler signature uses any for params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (params: any) => {
      try {
        // Validate input with Zod
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const validated = echoTool.metadata.inputSchema.parse(params.params);
        // Call the tool handler with validated input
        const result = await echoTool.handler(validated);
        return {
          ...result,
          content: result.content.map(item => ({ ...item, type: 'text' as const })),
        };
      } catch (error) {
        // Only log unexpected errors, not validation errors
        if (!(error instanceof z.ZodError)) {
          logToolError(echoTool.metadata.name, error, params);
        }
        const errorResult = createErrorResponse(error);
        return {
          ...errorResult,
          content: errorResult.content.map(item => ({ ...item, type: 'text' as const })),
        };
      }
    }
  );

  return server;
}
