/**
 * Echo tool - demonstrates tool registration pattern with Zod validation
 *
 * A simple tool that echoes back the input message. Useful as a template
 * for creating new tools.
 */

import { z } from 'zod';
import { type ToolDefinition } from './types.js';

const echoInputSchema = z.object({
  message: z.string().describe('The message to echo back'),
});

/**
 * Echo tool definition
 *
 * Example tool that demonstrates:
 * - Zod schema validation
 * - TypeScript type inference from schema
 * - Standard tool response format
 */
export const echoTool: ToolDefinition<typeof echoInputSchema> = {
  metadata: {
    name: 'echo',
    description: 'Echoes back the provided message. Useful for testing tool registration.',
    inputSchema: echoInputSchema,
  },

  handler: (input) => {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${input.message}`,
        },
      ],
    };
  },
};
