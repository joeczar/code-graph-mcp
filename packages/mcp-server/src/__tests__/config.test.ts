import { describe, it, expect, afterEach } from 'vitest';
import { getProjectId } from '../config.js';

describe('config', () => {
  const originalEnv = process.env['PROJECT_ID'];

  afterEach(() => {
    // Restore original environment
    if (originalEnv === undefined) {
      delete process.env['PROJECT_ID'];
    } else {
      process.env['PROJECT_ID'] = originalEnv;
    }
  });

  describe('getProjectId', () => {
    it('should return PROJECT_ID from environment when set', () => {
      process.env['PROJECT_ID'] = 'my-project';
      expect(getProjectId()).toBe('my-project');
    });

    it('should return "unknown" when PROJECT_ID is not set', () => {
      delete process.env['PROJECT_ID'];
      expect(getProjectId()).toBe('unknown');
    });

    it('should return "unknown" when PROJECT_ID is empty string', () => {
      process.env['PROJECT_ID'] = '';
      expect(getProjectId()).toBe('unknown');
    });

    it('should handle PROJECT_ID with special characters', () => {
      process.env['PROJECT_ID'] = 'my-project-123_test';
      expect(getProjectId()).toBe('my-project-123_test');
    });

    it('should trim whitespace from PROJECT_ID', () => {
      process.env['PROJECT_ID'] = '  my-project  ';
      expect(getProjectId()).toBe('my-project');
    });
  });
});
