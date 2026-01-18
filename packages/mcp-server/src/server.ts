import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

export function createServer(): Server {
  const server = new Server(
    { name: 'code-graph-mcp', version: '0.0.1' },
    { capabilities: { tools: {} } }
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'ping',
          description: 'Simple ping tool for testing connectivity',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      if (request.params.name === 'ping') {
        return {
          content: [
            {
              type: 'text',
              text: 'pong',
            },
          ],
        };
      }
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
  );

  return server;
}
