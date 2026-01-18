#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  const cleanup = (): void => {
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  await server.connect(transport);

  // Keep process alive
  await new Promise(() => {
    // Never resolves - server runs until interrupted
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
