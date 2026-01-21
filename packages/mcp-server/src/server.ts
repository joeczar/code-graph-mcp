import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerRequest, ServerNotification, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { echoTool } from './tools/echo.js';
import { graphStatusTool } from './tools/graph-status.js';
import { whatCallsTool } from './tools/what-calls.js';
import { whatDoesCallTool } from './tools/what-does-call.js';
import { blastRadiusTool } from './tools/blast-radius.js';
import { findEntityTool } from './tools/find-entity.js';
import { getExportsTool } from './tools/get-exports.js';
import { parseFileTool } from './tools/parse-file.js';
import { createErrorResponse, type ToolDefinition } from './tools/types.js';
import { logger } from './tools/logger.js';

/**
 * Callback type for MCP tool handlers.
 * The SDK validates input and passes typed args to this callback.
 */
type McpToolCallback<T> = (
  args: z.infer<T>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => Promise<CallToolResult>;

/**
 * Register a tool with the MCP server using the standard pattern
 *
 * The MCP SDK validates input against the Zod schema and passes
 * the validated args directly to the callback.
 *
 * Note: We use a type assertion for the callback because the SDK's generic
 * types don't align perfectly with our ToolDefinition pattern. The SDK itself
 * uses similar assertions internally (see executeToolHandler in mcp.js).
 *
 * Handles:
 * - Error logging for execution errors
 * - Consistent response formatting
 */
function registerTool<T extends z.ZodObject<z.ZodRawShape>>(
  server: McpServer,
  tool: ToolDefinition<T>
): void {
  const toolName = tool.metadata.name;
  const toolHandler = tool.handler;

  const callback: McpToolCallback<T> = async (args, _extra) => {
    try {
      // SDK has already validated args against inputSchema
      const result = await toolHandler(args);
      return {
        content: result.content.map(item => ({ type: 'text' as const, text: item.text })),
        isError: result.isError,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Shouldn't happen since SDK validates, but handle just in case
        logger.warn('Tool validation failed', {
          toolName,
          error: error.issues,
        });
      } else if (error instanceof Error) {
        logger.error('Tool execution failed', {
          toolName,
          error,
          args,
        });
      } else {
        logger.error('Unknown error in tool execution', {
          toolName,
          error,
          args,
        });
      }
      const errorResult = createErrorResponse(error);
      return {
        content: errorResult.content.map(item => ({ type: 'text' as const, text: item.text })),
        isError: true,
      };
    }
  };

  server.registerTool(
    toolName,
    {
      title: toolName,
      description: tool.metadata.description,
      inputSchema: tool.metadata.inputSchema,
    },
    // Type assertion needed: SDK's BaseToolCallback generic doesn't align with
    // z.ZodObject. The SDK validates input and passes z.infer<T> to callback.
    callback as Parameters<typeof server.registerTool>[2]
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
  registerTool(server, parseFileTool);

  return server;
}
