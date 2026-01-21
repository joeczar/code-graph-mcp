/**
 * Server configuration utilities
 *
 * Provides access to environment-based configuration values
 * with sensible defaults.
 */

import { logger } from './tools/logger.js';

/**
 * Get the project ID from environment variables
 *
 * Reads PROJECT_ID from process.env and falls back to 'unknown' if not set.
 * Useful for multi-tenant scenarios or distinguishing between different
 * codebases using the same MCP server instance.
 *
 * @returns Project ID string, defaults to 'unknown'
 */
export function getProjectId(): string {
  const projectId = process.env['PROJECT_ID']?.trim();
  // Empty string or undefined should fall back to 'unknown'
  if (!projectId) {
    logger.warn(
      'PROJECT_ID environment variable not set, defaulting to "unknown". ' +
        'Set PROJECT_ID to identify this project in metrics.'
    );
    return 'unknown';
  }
  return projectId;
}
