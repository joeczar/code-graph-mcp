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
  content: { type: string; text: string }[];
  isError?: boolean;
}

/**
 * Creates a standardized error response for tool failures
 *
 * @param error - Error object, string, or unknown error
 * @returns Formatted error response for MCP protocol
 */
export function createErrorResponse(error: unknown): ToolResponse {
  let message: string;

  if (error instanceof Error) {
    message = `Error: ${error.message}`;
  } else if (typeof error === 'string') {
    message = `Error: ${error}`;
  } else {
    message = 'Error: Unknown error';
  }

  return {
    content: [
      {
        type: 'text',
        text: message,
      },
    ],
    isError: true,
  };
}
