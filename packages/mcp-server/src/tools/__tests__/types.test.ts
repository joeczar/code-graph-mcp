import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createErrorResponse } from '../types.js';

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

  it('should create error response from Zod validation error', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    try {
      schema.parse({ name: 123, age: 'invalid' });
    } catch (error) {
      const response = createErrorResponse(error);

      expect(response.isError).toBe(true);
      expect(response.content[0]?.type).toBe('text');
      // Zod error should contain validation details
      const text = (response.content[0] as { text: string }).text;
      expect(text).toContain('Expected string');
      expect(text).toContain('Expected number');
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
          text: 'Error: Unknown error',
        },
      ],
      isError: true,
    });
  });
});
