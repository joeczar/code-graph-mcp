/**
 * Server configuration utilities
 *
 * Provides access to environment-based configuration values
 * with sensible defaults.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { logger } from './tools/logger.js';

/**
 * Detect project ID from git remote origin URL
 *
 * Extracts the repository name from git's remote.origin.url configuration.
 * Supports SSH and HTTPS formats with or without .git suffix.
 *
 * Examples:
 * - git@github.com:owner/repo.git → repo
 * - https://github.com/owner/repo.git → repo
 * - https://github.com/owner/repo → repo
 *
 * @returns Repository name or null if detection fails
 */
function detectProjectIdFromGit(): string | null {
  try {
    const output = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (!output) {
      return null;
    }

    // Extract repo name from various URL formats
    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    // HTTPS no .git: https://github.com/owner/repo

    // Remove .git suffix if present
    let url = output.endsWith('.git') ? output.slice(0, -4) : output;

    // Extract the last path component (repo name)
    // For SSH format (contains :), split on : and take the last part
    // For HTTPS format, split on / and take the last part
    const parts = url.includes(':') ? url.split(':') : url.split('/');
    const repoPath = parts[parts.length - 1];

    if (!repoPath) {
      return null;
    }

    // Handle owner/repo format by taking just the repo
    const repoName = repoPath.includes('/') ? repoPath.split('/').pop() : repoPath;

    return repoName || null;
  } catch {
    // Git command failed (not a git repo, no remote, etc.)
    return null;
  }
}

/**
 * Detect project ID from package.json name field
 *
 * Reads package.json from the current working directory and extracts
 * the name field. Handles scoped packages by stripping the @scope/ prefix.
 *
 * Examples:
 * - "my-package" → my-package
 * - "@myorg/my-package" → my-package
 *
 * @returns Package name or null if detection fails
 */
function detectProjectIdFromPackageJson(): string | null {
  try {
    const packageJsonPath = `${process.cwd()}/package.json`;
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as { name?: string };

    const name = packageJson.name?.trim();
    if (!name) {
      return null;
    }

    // Strip @scope/ prefix for scoped packages
    // @myorg/my-package → my-package
    const scopeMatch = name.match(/^@[^/]+\/(.+)$/);
    return scopeMatch?.[1] ?? name;
  } catch {
    // File doesn't exist, invalid JSON, or no name field
    return null;
  }
}

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
