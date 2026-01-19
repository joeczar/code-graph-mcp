/**
 * Tool registration types and utilities
 *
 * Provides standard types and helpers for creating MCP tools with Zod validation.
 */

import { z } from 'zod';

/**
 * Tool metadata defining how to register a tool with the MCP server
 */
export interface ToolMetadata<TInput extends z.ZodType> {
  /** Unique tool name (no spaces, lowercase recommended) */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** Zod schema for input validation */
  inputSchema: TInput;
}

/**
 * Tool handler function that processes validated input
 */
export type ToolHandler<TInput extends z.ZodType> = (
  input: z.infer<TInput>
) => Promise<ToolResponse> | ToolResponse;

/**
 * Complete tool definition including metadata and handler
 */
export interface ToolDefinition<TInput extends z.ZodType> {
  metadata: ToolMetadata<TInput>;
  handler: ToolHandler<TInput>;
}

/**
 * Tool response format for MCP protocol
 */
export interface ToolResponse {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * Error response type with isError always true
 */
export type ErrorResponse = ToolResponse & { isError: true };

/**
 * Success response type with isError always false or undefined
 */
export type SuccessResponse = ToolResponse & { isError?: false };

/**
 * Creates a standardized success response for tool results
 *
 * @param text - The text content to return
 * @returns Formatted success response for MCP protocol
 */
export function createSuccessResponse(text: string): SuccessResponse {
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Creates a standardized error response for tool failures
 *
 * @param error - Error object, string, or unknown error
 * @returns Formatted error response for MCP protocol
 */
export function createErrorResponse(error: unknown): ErrorResponse {
  let message: string;

  if (error instanceof z.ZodError) {
    // Provide detailed validation error messages
    const issues = error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    message = `Validation error: ${issues}`;
  } else if (error instanceof Error) {
    message = `Error: ${error.message}`;
  } else if (typeof error === 'string') {
    message = `Error: ${error}`;
  } else {
    message = 'Error: An unexpected error occurred';
  }

  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
