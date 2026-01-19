import { describe, expect, it } from 'vitest';
import {
  ToolValidationError,
  ToolNotFoundError,
  ToolExecutionError,
  ToolTimeoutError,
  ResourceNotFoundError,
  DatabaseError,
} from '../errors.js';

describe('Custom Error Classes', () => {
  describe('ToolValidationError', () => {
    it('should create error with validation details', () => {
      const error = new ToolValidationError('Invalid parameters', {
        field: 'name',
        expected: 'string',
        received: 'number',
      });

      expect(error.name).toBe('ToolValidationError');
      expect(error.message).toBe('Invalid parameters');
      expect(error.metadata).toEqual({
        field: 'name',
        expected: 'string',
        received: 'number',
      });
    });

    it('should be instanceof Error', () => {
      const error = new ToolValidationError('Test');
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('ToolNotFoundError', () => {
    it('should create error with tool name', () => {
      const error = new ToolNotFoundError('Tool not found', {
        toolName: 'nonexistent_tool',
      });

      expect(error.name).toBe('ToolNotFoundError');
      expect(error.message).toBe('Tool not found');
      expect(error.metadata.toolName).toBe('nonexistent_tool');
    });
  });

  describe('ToolExecutionError', () => {
    it('should create error with execution details', () => {
      const error = new ToolExecutionError('Execution failed', {
        toolName: 'ping',
        originalError: 'Network timeout',
      });

      expect(error.name).toBe('ToolExecutionError');
      expect(error.message).toBe('Execution failed');
      expect(error.metadata.toolName).toBe('ping');
      expect(error.metadata.originalError).toBe('Network timeout');
    });

    it('should handle Error objects in metadata', () => {
      const originalError = new Error('Original error');
      const error = new ToolExecutionError('Wrapped error', {
        originalError,
      });

      expect(error.metadata.originalError).toBe(originalError);
    });
  });

  describe('ToolTimeoutError', () => {
    it('should create error with timeout details', () => {
      const error = new ToolTimeoutError('Operation timed out', {
        timeoutMs: 5000,
        toolName: 'slow_operation',
      });

      expect(error.name).toBe('ToolTimeoutError');
      expect(error.message).toBe('Operation timed out');
      expect(error.metadata.timeoutMs).toBe(5000);
      expect(error.metadata.toolName).toBe('slow_operation');
    });
  });

  describe('ResourceNotFoundError', () => {
    it('should create error with resource details', () => {
      const error = new ResourceNotFoundError('Resource not found', {
        resourceType: 'file',
        resourceId: '/path/to/file.ts',
      });

      expect(error.name).toBe('ResourceNotFoundError');
      expect(error.message).toBe('Resource not found');
      expect(error.metadata.resourceType).toBe('file');
      expect(error.metadata.resourceId).toBe('/path/to/file.ts');
    });
  });

  describe('DatabaseError', () => {
    it('should create error with database operation details', () => {
      const error = new DatabaseError('Database operation failed', {
        operation: 'INSERT',
        table: 'nodes',
        originalError: 'UNIQUE constraint failed',
      });

      expect(error.name).toBe('DatabaseError');
      expect(error.message).toBe('Database operation failed');
      expect(error.metadata.operation).toBe('INSERT');
      expect(error.metadata.table).toBe('nodes');
      expect(error.metadata.originalError).toBe('UNIQUE constraint failed');
    });
  });

  describe('Error stack traces', () => {
    it('should preserve stack traces', () => {
      const error = new ToolExecutionError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ToolExecutionError');
    });
  });

  describe('Error serialization', () => {
    it('should be JSON serializable', () => {
      const error = new ToolValidationError('Invalid input', {
        field: 'age',
        value: -1,
      });

      const serialized = JSON.stringify({
        name: error.name,
        message: error.message,
        metadata: error.metadata,
      });

      const parsed = JSON.parse(serialized);
      expect(parsed.name).toBe('ToolValidationError');
      expect(parsed.message).toBe('Invalid input');
      expect(parsed.metadata).toEqual({ field: 'age', value: -1 });
    });
  });
});
