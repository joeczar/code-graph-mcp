/**
 * Tool exports - barrel file for all MCP tools
 *
 * Re-exports types, utilities, and tool definitions.
 */

// Types and utilities
export {
  type ToolMetadata,
  type ToolHandler,
  type ToolDefinition,
  type ToolResponse,
  type ErrorResponse,
  type SuccessResponse,
  createErrorResponse,
  createSuccessResponse,
} from './types.js';

// Tool definitions
export { echoTool } from './echo.js';
