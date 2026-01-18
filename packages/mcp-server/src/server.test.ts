import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from './server.js';

describe('createServer', () => {
  it('should create a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server).toBeInstanceOf(McpServer);
  });

  it('should have registerTool method', () => {
    const server = createServer();
    expect(server).toHaveProperty('registerTool');
    expect(typeof server.registerTool).toBe('function');
  });

  it('should have connect method', () => {
    const server = createServer();
    expect(server).toHaveProperty('connect');
    expect(typeof server.connect).toBe('function');
  });

  it('should have close method for graceful shutdown', () => {
    const server = createServer();
    expect(server).toHaveProperty('close');
    expect(typeof server.close).toBe('function');
  });
});
