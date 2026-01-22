/**
 * Server configuration utilities
 *
 * Provides access to environment-based configuration values
 * with sensible defaults.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

    // Extract repo name from URL (handles SSH and HTTPS formats)
    // SSH: git@github.com:owner/repo.git → repo
    // HTTPS: https://github.com/owner/repo.git → repo
    const match = /[/:]([^/]+?)(?:\.git)?$/.exec(output);
    return match?.[1] ?? null;
  } catch (error) {
    // Git command failed (not a git repo, no remote, etc.)
    logger.debug('Git project ID detection failed', {
      error: error instanceof Error ? error.message : String(error),
    });
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
    const packageJsonPath = join(process.cwd(), 'package.json');
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content) as { name?: string };

    const name = packageJson.name?.trim();
    if (!name) {
      return null;
    }

    // Strip @scope/ prefix for scoped packages (@myorg/my-package → my-package)
    return name.replace(/^@[^/]+\//, '');
  } catch (error) {
    // File doesn't exist, invalid JSON, or no name field
    logger.debug('package.json project ID detection failed', {
      path: join(process.cwd(), 'package.json'),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// Cache for project ID to avoid repeated I/O operations
let cachedProjectId: string | undefined;

/**
 * Reset the project ID cache (for testing only)
 * @internal
 */
export function resetProjectIdCache(): void {
  cachedProjectId = undefined;
}

/**
 * Get the project ID with automatic detection
 *
 * Attempts to identify the project using multiple methods in order:
 * 1. PROJECT_ID environment variable (explicit configuration)
 * 2. Git remote origin URL (extracts repository name)
 * 3. package.json name field (strips @scope/ prefix)
 * 4. Fallback to 'unknown' if all methods fail
 *
 * Results are cached after the first call to avoid repeated I/O operations.
 *
 * Useful for multi-tenant scenarios or distinguishing between different
 * codebases using the same MCP server instance.
 *
 * @returns Project ID string, defaults to 'unknown'
 */
export function getProjectId(): string {
  if (cachedProjectId !== undefined) {
    return cachedProjectId;
  }

  // 1. Check environment variable (explicit configuration takes precedence)
  const envProjectId = process.env['PROJECT_ID']?.trim();
  if (envProjectId) {
    cachedProjectId = envProjectId;
    return cachedProjectId;
  }

  // 2. Try git remote origin URL
  const gitProjectId = detectProjectIdFromGit();
  if (gitProjectId) {
    logger.info(`Auto-detected project ID from git: ${gitProjectId}`);
    cachedProjectId = gitProjectId;
    return cachedProjectId;
  }

  // 3. Try package.json name field
  const packageJsonProjectId = detectProjectIdFromPackageJson();
  if (packageJsonProjectId) {
    logger.info(`Auto-detected project ID from package.json: ${packageJsonProjectId}`);
    cachedProjectId = packageJsonProjectId;
    return cachedProjectId;
  }

  // 4. Fallback to 'unknown' if all methods fail
  logger.warn(
    'Could not detect project ID. Set PROJECT_ID environment variable to identify this project in metrics.'
  );
  cachedProjectId = 'unknown';
  return cachedProjectId;
}
