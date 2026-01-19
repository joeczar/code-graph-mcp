import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  formatToolResponse,
} from '../types.js';
import {
  ToolValidationError,
  ToolNotFoundError,
  ToolExecutionError,
  DatabaseError,
} from '../errors.js';

describe('createErrorResponse', () => {
  it('should create error response from Error object', () => {
    const error = new Error('Test error message');
    const response = createErrorResponse(error);

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Test error message',
        },
      ],
      isError: true,
    });
  });

  it('should create error response from Zod validation error with detailed messages', () => {
    expect.assertions(4);

    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    try {
      schema.parse({ name: 123, age: 'invalid' });
      expect.fail('Expected ZodError to be thrown');
    } catch (error) {
      const response = createErrorResponse(error);

      expect(response.isError).toBe(true);
      expect(response.content[0]?.type).toBe('text');
      // New format: "Validation error: path: message; path: message"
      const text = response.content[0]?.text ?? '';
      expect(text).toContain('Validation error:');
      expect(text).toContain('name:');
    }
  });

  it('should create error response from string', () => {
    const response = createErrorResponse('Simple error message');

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: Simple error message',
        },
      ],
      isError: true,
    });
  });

  it('should create error response from unknown error type', () => {
    const response = createErrorResponse({ custom: 'error' });

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: An unexpected error occurred',
        },
      ],
      isError: true,
    });
  });

  it('should handle null as unknown error', () => {
    const response = createErrorResponse(null);

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: An unexpected error occurred',
        },
      ],
      isError: true,
    });
  });

  it('should handle undefined as unknown error', () => {
    const response = createErrorResponse(undefined);

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error: An unexpected error occurred',
        },
      ],
      isError: true,
    });
  });
});

describe('createSuccessResponse', () => {
  it('should create success response with text', () => {
    const response = createSuccessResponse('Hello, World!');

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: 'Hello, World!',
        },
      ],
    });
  });

  it('should create success response with empty string', () => {
    const response = createSuccessResponse('');

    expect(response).toEqual({
      content: [
        {
          type: 'text',
          text: '',
        },
      ],
    });
  });

  it('should not have isError property', () => {
    const response = createSuccessResponse('test');

    expect(response.isError).toBeUndefined();
  });
});

describe('createErrorResponse with custom error types', () => {
  it('should handle ToolValidationError with metadata', () => {
    const error = new ToolValidationError('Invalid input', {
      field: 'age',
      expected: 'number',
      received: 'string',
    });
    const response = createErrorResponse(error);

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('Invalid input');
    expect(response.content[0]?.text).toContain('age');
    expect(response.content[0]?.text).toContain('number');
  });

  it('should handle ToolNotFoundError', () => {
    const error = new ToolNotFoundError('Tool does not exist', {
      toolName: 'unknown_tool',
    });
    const response = createErrorResponse(error);

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('Tool does not exist');
    expect(response.content[0]?.text).toContain('unknown_tool');
  });

  it('should handle ToolExecutionError with original error', () => {
    const error = new ToolExecutionError('Execution failed', {
      toolName: 'ping',
      originalError: 'Network timeout',
    });
    const response = createErrorResponse(error);

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('Execution failed');
    expect(response.content[0]?.text).toContain('Network timeout');
  });

  it('should handle DatabaseError', () => {
    const error = new DatabaseError('Query failed', {
      operation: 'INSERT',
      table: 'nodes',
    });
    const response = createErrorResponse(error);

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('Query failed');
    expect(response.content[0]?.text).toContain('INSERT');
    expect(response.content[0]?.text).toContain('nodes');
  });
});

describe('formatToolResponse', () => {
  it('should format success response', () => {
    const result = { data: 'test', count: 5 };
    const response = formatToolResponse(result);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain('"data": "test"');
    expect(response.content[0]?.text).toContain('"count": 5');
  });

  it('should format string response', () => {
    const result = 'Simple text response';
    const response = formatToolResponse(result);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toBe('Simple text response');
  });

  it('should format number response', () => {
    const result = 42;
    const response = formatToolResponse(result);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toBe('42');
  });

  it('should format boolean response', () => {
    const response = formatToolResponse(true);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toBe('true');
  });

  it('should format array response', () => {
    const result = ['item1', 'item2', 'item3'];
    const response = formatToolResponse(result);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toContain('item1');
    expect(response.content[0]?.text).toContain('item2');
  });

  it('should format null response', () => {
    const response = formatToolResponse(null);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toBe('null');
  });

  it('should format undefined as empty string', () => {
    const response = formatToolResponse(undefined);

    expect(response.isError).toBeUndefined();
    expect(response.content[0]?.text).toBe('');
  });

  it('should pretty-print JSON with indentation', () => {
    const result = { nested: { key: 'value' } };
    const response = formatToolResponse(result);

    const text = response.content[0]?.text ?? '';
    expect(text).toContain('  "nested"');
    expect(text).toContain('    "key"');
  });
});
