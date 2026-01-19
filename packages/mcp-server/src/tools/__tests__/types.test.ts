import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createErrorResponse, createSuccessResponse } from '../types.js';

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
