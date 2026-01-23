import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerRequest, ServerNotification, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  getDatabase,
  createMigrationRunner,
  createMetricsStore,
  type MetricsStore,
} from '@code-graph/core';
import { echoTool } from './tools/echo.js';
import { graphStatusTool } from './tools/graph-status.js';
import { whatCallsTool } from './tools/what-calls.js';
import { whatDoesCallTool } from './tools/what-does-call.js';
import { blastRadiusTool } from './tools/blast-radius.js';
import { findEntityTool } from './tools/find-entity.js';
import { getExportsTool } from './tools/get-exports.js';
import { parseFileTool } from './tools/parse-file.js';
import { parseDirectoryTool } from './tools/parse-directory.js';
import { parseDirectoryStartTool } from './tools/parse-directory-start.js';
import { parseDirectoryStatusTool } from './tools/parse-directory-status.js';
import { findDeadCodeTool } from './tools/find-dead-code.js';
import { circularDependenciesTool } from './tools/circular-dependencies.js';
import { createErrorResponse, type ToolDefinition } from './tools/types.js';
import { logger } from './tools/logger.js';
import { instrumentHandler } from './tools/instrument.js';
import { getProjectId } from './config.js';

/**
 * Callback type for MCP tool handlers.
 * The SDK validates input and passes typed args to this callback.
 */
type McpToolCallback<T extends z.ZodType> = (
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
 * - Metrics collection via instrumentation
 */
function registerTool<T extends z.ZodObject<z.ZodRawShape>>(
  server: McpServer,
  tool: ToolDefinition<T>,
  metricsStore: MetricsStore,
  projectId: string
): void {
  const toolName = tool.metadata.name;
  // Wrap handler with metrics instrumentation
  const toolHandler = instrumentHandler(toolName, tool.handler, metricsStore, projectId);

  const callback: McpToolCallback<T> = async (args, extra) => {
    try {
      // SDK has already validated args against inputSchema
      // Pass extra context for progress notifications and other MCP features
      const result = await toolHandler(args, extra);
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

  // Initialize database and run migrations early
  const db = getDatabase();
  const migrationRunner = createMigrationRunner(db);
  migrationRunner.run();

  // Create metrics store and get project ID
  const metricsStore = createMetricsStore(db);
  const projectId = getProjectId();

  // Register ping tool with instrumentation for connectivity testing
  const pingHandler = instrumentHandler(
    'ping',
    () => ({ content: [{ type: 'text' as const, text: 'pong' }] }),
    metricsStore,
    projectId
  );

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Simple ping tool for testing connectivity',
      inputSchema: {},
    },
    async () => {
      const result = await pingHandler({});
      return {
        content: result.content.map(item => ({ type: 'text' as const, text: item.text })),
      };
    }
  );

  // Register tools using the standard pattern (with metrics instrumentation)
  registerTool(server, echoTool, metricsStore, projectId);
  registerTool(server, graphStatusTool, metricsStore, projectId);
  registerTool(server, whatCallsTool, metricsStore, projectId);
  registerTool(server, whatDoesCallTool, metricsStore, projectId);
  registerTool(server, blastRadiusTool, metricsStore, projectId);
  registerTool(server, findEntityTool, metricsStore, projectId);
  registerTool(server, getExportsTool, metricsStore, projectId);
  registerTool(server, parseFileTool, metricsStore, projectId);
  registerTool(server, parseDirectoryTool, metricsStore, projectId);
  registerTool(server, parseDirectoryStartTool, metricsStore, projectId);
  registerTool(server, parseDirectoryStatusTool, metricsStore, projectId);
  registerTool(server, findDeadCodeTool, metricsStore, projectId);
  registerTool(server, circularDependenciesTool, metricsStore, projectId);

  return server;
}
