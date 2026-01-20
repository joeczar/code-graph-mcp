import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { echoTool } from './tools/echo.js';
import { graphStatusTool } from './tools/graph-status.js';
import { whatCallsTool } from './tools/what-calls.js';
import { whatDoesCallTool } from './tools/what-does-call.js';
import { blastRadiusTool } from './tools/blast-radius.js';
import { findEntityTool } from './tools/find-entity.js';
import { getExportsTool } from './tools/get-exports.js';
import { createErrorResponse, type ToolDefinition } from './tools/types.js';
import { logger } from './tools/logger.js';

/**
 * Register a tool with the MCP server using the standard pattern
 *
 * Handles:
 * - JSON Schema generation from Zod schema
 * - Input validation with Zod
 * - Error logging for non-validation errors
 * - Consistent response formatting
 */
function registerTool<T extends z.ZodType>(
  server: McpServer,
  tool: ToolDefinition<T>
): void {
  server.registerTool(
    tool.metadata.name,
    {
      title: tool.metadata.name,
      description: tool.metadata.description,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      inputSchema: zodToJsonSchema(tool.metadata.inputSchema) as any,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (params: any) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
        const validated = tool.metadata.inputSchema.parse(params.params);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const result = await tool.handler(validated);
        return {
          ...result,
          content: result.content.map(item => ({ ...item, type: 'text' as const })),
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.warn('Tool validation failed', {
            toolName: tool.metadata.name,
            error: error.errors,
          });
        } else if (error instanceof Error) {
          logger.error('Tool execution failed', {
            toolName: tool.metadata.name,
            error,
            params,
          });
        } else {
          logger.error('Unknown error in tool execution', {
            toolName: tool.metadata.name,
            error,
            params,
          });
        }
        const errorResult = createErrorResponse(error);
        return {
          ...errorResult,
          content: errorResult.content.map(item => ({ ...item, type: 'text' as const })),
        };
      }
    }
  );
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

  // Register tools using the standard pattern
  registerTool(server, echoTool);
  registerTool(server, graphStatusTool);
  registerTool(server, whatCallsTool);
  registerTool(server, whatDoesCallTool);
  registerTool(server, blastRadiusTool);
  registerTool(server, findEntityTool);
  registerTool(server, getExportsTool);

  return server;
}
