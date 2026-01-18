#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const cleanup = async (): Promise<void> => {
    try {
      await server.close();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void cleanup());
  process.on('SIGTERM', () => void cleanup());

  await server.connect(transport);
  // StdioServerTransport keeps the event loop alive via stdin
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
