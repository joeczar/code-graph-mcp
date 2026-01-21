/**
 * Input sanitization utilities for metrics collection
 *
 * Provides functions to sanitize tool inputs before storing in metrics:
 * - Truncates long inputs
 * - Converts absolute paths to relative
 * - Removes secrets and sensitive data
 */

import { logger } from './logger.js';

const MAX_LENGTH = 200;
const SECRET_FIELDS = ['apikey', 'token', 'password', 'secret', 'auth', 'credential'];

/**
 * Sanitize tool input for metrics storage
 *
 * Processes input to:
 * 1. Convert to JSON string
 * 2. Redact sensitive fields
 * 3. Convert absolute paths to relative
 * 4. Truncate to ~200 characters
 *
 * @param input - Tool input to sanitize (any type)
 * @returns Sanitized string suitable for metrics storage
 */
export function sanitizeInput(input: unknown): string {
  // Handle undefined explicitly
  if (input === undefined) {
    return 'undefined';
  }

  // Handle null
  if (input === null) {
    return 'null';
  }

  // Handle primitive types
  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    const str = JSON.stringify(input);
    return truncate(str);
  }

  // Handle objects and arrays
  try {
    // Deep clone to avoid modifying original
    const cloned = deepClone(input);

    // Redact secrets
    const redacted = redactSecrets(cloned);

    // Convert to JSON
    let json = JSON.stringify(redacted);

    // Convert absolute paths to relative
    json = convertPathsToRelative(json);

    // Truncate
    return truncate(json);
  } catch (error) {
    // Log the serialization failure for debugging, then return a safe fallback
    logger.warn('Failed to serialize input for metrics', {
      error: error instanceof Error ? error.message : String(error),
      inputType: typeof input,
    });
    return '[Unable to serialize input]';
  }
}

/**
 * Deep clone an object/array, handling circular references
 */
function deepClone(obj: unknown): unknown {
  const seen = new WeakSet();

  function clone(value: unknown): unknown {
    // Handle primitives and null
    if (value === null || typeof value !== 'object') {
      return value;
    }

    // Handle circular references
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => clone(item));
    }

    // Handle objects
    const cloned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = clone(val);
    }
    return cloned;
  }

  return clone(obj);
}

/**
 * Recursively redact secret fields in an object
 */
function redactSecrets(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecrets(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSecret = SECRET_FIELDS.some(field => lowerKey.includes(field));

    if (isSecret) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSecrets(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Convert absolute paths to relative paths in a JSON string
 */
function convertPathsToRelative(json: string): string {
  // Match common absolute path patterns
  // Unix: /home/user/... or /Users/user/...
  // Windows: C:\Users\...

  // Unix paths: replace up to and including project directory patterns
  let result = json.replace(/\/(?:home|Users)\/[^/]+\/[^/]+\//g, '');

  // Windows paths: replace drive letter and up to project directory
  result = result.replace(/[A-Z]:\\(?:Users\\[^\\]+\\[^\\]+\\)/g, '');

  // Also handle escaped backslashes in JSON
  result = result.replace(/[A-Z]:\\\\(?:Users\\\\[^\\\\]+\\\\[^\\\\]+\\\\)/g, '');

  return result;
}

/**
 * Truncate string to maximum length with ellipsis
 */
function truncate(str: string): string {
  if (str.length <= MAX_LENGTH) {
    return str;
  }

  return str.slice(0, MAX_LENGTH) + '...';
}
