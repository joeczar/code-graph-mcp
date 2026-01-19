import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { echoTool } from './tools/echo.js';
import { createErrorResponse } from './tools/types.js';
import { logger } from './tools/logger.js';

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
      // Generate JSON Schema from Zod schema - single source of truth
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      inputSchema: zodToJsonSchema(echoTool.metadata.inputSchema) as any,
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
        // Convert unknown errors to typed errors for consistent handling
        if (error instanceof z.ZodError) {
          // Wrap Zod validation errors
          logger.warn('Tool validation failed', {
            toolName: echoTool.metadata.name,
            error: error.errors,
          });
        } else if (error instanceof Error) {
          // Wrap runtime errors
          logger.error('Tool execution failed', {
            toolName: echoTool.metadata.name,
            error,
            params,
          });
        } else {
          // Wrap completely unknown errors
          logger.error('Unknown error in tool execution', {
            toolName: echoTool.metadata.name,
            error,
            params,
          });
        }

        // For backward compatibility, still use original error for response formatting
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
