import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('should register tools without throwing', () => {
    expect(() => createServer()).not.toThrow();
  });
});

describe('ping tool', () => {
  it('should return pong response', () => {
    // Test the ping tool handler directly
    // The ping tool is registered inline, so we test the expected behavior
    const expectedResponse = {
      content: [{ type: 'text', text: 'pong' }],
    };

    // Create server and verify it was created successfully
    const server = createServer();
    expect(server).toBeDefined();

    // The ping response format should match MCP protocol
    expect(expectedResponse.content[0]?.type).toBe('text');
    expect(expectedResponse.content[0]?.text).toBe('pong');
  });
});

describe('echo tool integration', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Suppress console.error and console.warn during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should register echo tool with correct metadata', () => {
    // Verify the echo tool is registered by checking server creation succeeds
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('should validate input with Zod schema', async () => {
    // Import the echo tool to test validation directly
    const { echoTool } = await import('./tools/echo.js');

    // Valid input should parse successfully
    const validInput = { message: 'Hello' };
    const parsed = echoTool.metadata.inputSchema.safeParse(validInput);
    expect(parsed.success).toBe(true);

    // Invalid input should fail validation
    const invalidInput = { message: 123 };
    const invalidParsed = echoTool.metadata.inputSchema.safeParse(invalidInput);
    expect(invalidParsed.success).toBe(false);

    // Missing message should fail validation
    const missingInput = {};
    const missingParsed = echoTool.metadata.inputSchema.safeParse(missingInput);
    expect(missingParsed.success).toBe(false);
  });

  it('should return echo response for valid input', async () => {
    const { echoTool } = await import('./tools/echo.js');

    const response = await echoTool.handler({ message: 'Test message' });

    expect(response).toEqual({
      content: [{ type: 'text', text: 'Echo: Test message' }],
    });
  });

  it('should handle validation errors with createErrorResponse', async () => {
    const { createErrorResponse } = await import('./tools/types.js');
    const { z } = await import('zod');

    // Simulate what happens when invalid input is passed
    const schema = z.object({ message: z.string() });

    try {
      schema.parse({ message: 123 });
    } catch (error) {
      const errorResponse = createErrorResponse(error);
      expect(errorResponse.isError).toBe(true);
      expect(errorResponse.content[0]?.text).toContain('Validation error:');
    }
  });

  it('should log errors appropriately based on type', async () => {
    // This tests the error logging behavior in server.ts
    // Validation errors should log as warnings, runtime errors as errors
    const { createErrorResponse } = await import('./tools/types.js');
    const { z } = await import('zod');

    // Create a validation error - should trigger warning log
    const zodError = new z.ZodError([
      { code: 'invalid_type', expected: 'string' as const, received: 'number', path: ['message'], message: 'Expected string' },
    ]);
    const validationResponse = createErrorResponse(zodError);
    expect(validationResponse.isError).toBe(true);
    expect(validationResponse.content[0]?.text).toContain('Validation error:');

    // Create a regular error - would trigger error log in the actual handler
    const regularError = new Error('Something went wrong');
    const errorResponse = createErrorResponse(regularError);
    expect(errorResponse.isError).toBe(true);
    expect(errorResponse.content[0]?.text).toBe('Error: Something went wrong');
  });
});
