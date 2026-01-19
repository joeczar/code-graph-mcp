/**
 * Base class for all tool-related errors with structured metadata
 */
export class ToolError extends Error {
  public readonly metadata: Record<string, unknown>;

  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.metadata = metadata;

    // Maintains proper stack trace for where our error was thrown (V8 only)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when tool input validation fails (e.g., Zod validation)
 */
export class ToolValidationError extends ToolError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

/**
 * Thrown when a requested tool does not exist
 */
export class ToolNotFoundError extends ToolError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

/**
 * Thrown when tool execution fails at runtime
 */
export class ToolExecutionError extends ToolError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

/**
 * Thrown when tool execution exceeds timeout threshold
 */
export class ToolTimeoutError extends ToolError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

/**
 * Thrown when a requested resource cannot be found
 */
export class ResourceNotFoundError extends ToolError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}

/**
 * Thrown when a database operation fails
 */
export class DatabaseError extends ToolError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super(message, metadata);
  }
}
