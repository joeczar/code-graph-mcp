/**
 * Error classification utilities for metrics collection
 *
 * Maps error instances to standardized error type strings
 * for consistent metrics tracking.
 */

import { z } from 'zod';
import {
  ToolValidationError,
  ResourceNotFoundError,
  ToolExecutionError,
  DatabaseError,
  ToolTimeoutError,
} from './errors.js';

/**
 * Standard error types for metrics
 */
export type ErrorType =
  | 'ValidationError'
  | 'NotFound'
  | 'ExecutionError'
  | 'DatabaseError'
  | 'Timeout'
  | 'UnknownError';

/**
 * Classify an error into a standard error type
 *
 * Maps specific error classes to standardized type strings:
 * - ToolValidationError / ZodError -> ValidationError
 * - ResourceNotFoundError -> NotFound
 * - ToolExecutionError -> ExecutionError
 * - DatabaseError -> DatabaseError
 * - ToolTimeoutError -> Timeout
 * - Everything else -> UnknownError
 *
 * @param error - The error to classify (any type)
 * @returns Standardized error type string
 */
export function classifyError(error: unknown): ErrorType {
  // Validation errors (Zod or custom)
  if (error instanceof z.ZodError || error instanceof ToolValidationError) {
    return 'ValidationError';
  }

  if (error instanceof ResourceNotFoundError) {
    return 'NotFound';
  }

  if (error instanceof ToolExecutionError) {
    return 'ExecutionError';
  }

  if (error instanceof DatabaseError) {
    return 'DatabaseError';
  }

  if (error instanceof ToolTimeoutError) {
    return 'Timeout';
  }

  // All other errors (including generic Error, TypeError, etc.)
  return 'UnknownError';
}
