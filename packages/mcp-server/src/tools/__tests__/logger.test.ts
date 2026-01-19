/* eslint-disable @typescript-eslint/no-empty-function */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { logger, createLogger } from '../logger.js';
import { ToolExecutionError } from '../errors.js';

describe('logger', () => {
  beforeEach(() => {
    // Clear any previous console spies
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('should log debug messages', () => {
      const debugLogger = createLogger('debug');
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      debugLogger.debug('Debug message', { key: 'value' });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        expect.stringContaining('Debug message'),
        expect.objectContaining({ key: 'value' })
      );
    });

    it('should log info messages', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('Info message');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]'),
        expect.stringContaining('Info message')
      );
    });

    it('should log warn messages', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('Warning message', { warning: true });

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        expect.stringContaining('Warning message'),
        expect.objectContaining({ warning: true })
      );
    });

    it('should log error messages', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('Error message');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.stringContaining('Error message')
      );
    });
  });

  describe('context inclusion', () => {
    it('should include timestamp in log', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('Test');

      const call = spy.mock.calls[0];
      expect(call?.[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle context objects', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('Message', { toolName: 'ping', duration: 123 });

      expect(spy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          toolName: 'ping',
          duration: 123,
        })
      );
    });

    it('should handle undefined context', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('Message');

      expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(String));
      expect(spy.mock.calls[0]?.length).toBe(2);
    });
  });

  describe('error logging', () => {
    it('should log Error objects with stack trace', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Test error');

      logger.error('Operation failed', { error });

      const contextArg = spy.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(contextArg).toBeDefined();
      expect(contextArg['error']).toBe(error);
    });

    it('should log ToolError with metadata', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new ToolExecutionError('Execution failed', {
        toolName: 'test',
        originalError: 'Network timeout',
      });

      logger.error('Tool execution failed', { error });

      const contextArg = spy.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(contextArg).toBeDefined();
      expect(contextArg['error']).toBe(error);
    });
  });

  describe('createLogger with custom level', () => {
    it('should create logger with custom minimum level', () => {
      const customLogger = createLogger('error');

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      customLogger.debug('Should not log');
      customLogger.error('Should log');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('should respect info level', () => {
      const customLogger = createLogger('info');

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      customLogger.debug('Should not log');
      customLogger.info('Should log');

      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
    });
  });

  describe('log formatting', () => {
    it('should format log message consistently', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('Test message');

      const logMessage = String(spy.mock.calls[0]?.[0]);
      expect(logMessage).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\]$/);
    });

    it('should include message as second argument', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('Test message');

      const message = String(spy.mock.calls[0]?.[1]);
      expect(message).toBe('Test message');
    });
  });
});
