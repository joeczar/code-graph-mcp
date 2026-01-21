import { describe, it, expect } from 'vitest';
import { classifyError } from '../error-classifier.js';
import {
  ToolValidationError,
  ResourceNotFoundError,
  ToolExecutionError,
  DatabaseError,
  ToolTimeoutError,
} from '../errors.js';
import { z } from 'zod';

describe('classifyError', () => {
  describe('known error types', () => {
    it('should classify ToolValidationError', () => {
      const error = new ToolValidationError('Invalid input');
      expect(classifyError(error)).toBe('ValidationError');
    });

    it('should classify ZodError as ValidationError', () => {
      const schema = z.object({ name: z.string() });
      try {
        schema.parse({ name: 123 });
      } catch (error) {
        expect(classifyError(error)).toBe('ValidationError');
      }
    });

    it('should classify ResourceNotFoundError', () => {
      const error = new ResourceNotFoundError('Entity not found');
      expect(classifyError(error)).toBe('NotFound');
    });

    it('should classify ToolExecutionError', () => {
      const error = new ToolExecutionError('Execution failed');
      expect(classifyError(error)).toBe('ExecutionError');
    });

    it('should classify DatabaseError', () => {
      const error = new DatabaseError('Database query failed');
      expect(classifyError(error)).toBe('DatabaseError');
    });

    it('should classify ToolTimeoutError', () => {
      const error = new ToolTimeoutError('Operation timed out');
      expect(classifyError(error)).toBe('Timeout');
    });
  });

  describe('generic errors', () => {
    it('should classify generic Error as UnknownError', () => {
      const error = new Error('Something went wrong');
      expect(classifyError(error)).toBe('UnknownError');
    });

    it('should classify TypeError as UnknownError', () => {
      const error = new TypeError('Type mismatch');
      expect(classifyError(error)).toBe('UnknownError');
    });

    it('should classify ReferenceError as UnknownError', () => {
      const error = new ReferenceError('Variable not defined');
      expect(classifyError(error)).toBe('UnknownError');
    });
  });

  describe('non-error values', () => {
    it('should classify string as UnknownError', () => {
      expect(classifyError('error message')).toBe('UnknownError');
    });

    it('should classify number as UnknownError', () => {
      expect(classifyError(42)).toBe('UnknownError');
    });

    it('should classify null as UnknownError', () => {
      expect(classifyError(null)).toBe('UnknownError');
    });

    it('should classify undefined as UnknownError', () => {
      expect(classifyError(undefined)).toBe('UnknownError');
    });

    it('should classify object without Error properties as UnknownError', () => {
      expect(classifyError({ code: 'ERR_FAIL' })).toBe('UnknownError');
    });
  });

  describe('error messages', () => {
    it('should handle errors with metadata', () => {
      const error = new DatabaseError('Query failed', { query: 'SELECT *' });
      expect(classifyError(error)).toBe('DatabaseError');
    });

    it('should handle errors without messages', () => {
      const error = new Error();
      expect(classifyError(error)).toBe('UnknownError');
    });

    it('should handle nested error causes', () => {
      const cause = new DatabaseError('Inner error');
      const error = new ToolExecutionError('Outer error', { cause });
      expect(classifyError(error)).toBe('ExecutionError');
    });
  });
});
