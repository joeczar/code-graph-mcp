import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { getProjectId, resetProjectIdCache } from '../config.js';

// Mock modules
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('../tools/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('config', () => {
  const originalEnv = process.env['PROJECT_ID'];

  beforeEach(() => {
    // Clear all mocks and reset cache before each test
    vi.clearAllMocks();
    resetProjectIdCache();
  });

  afterEach(() => {
    // Restore original environment
    if (originalEnv === undefined) {
      delete process.env['PROJECT_ID'];
    } else {
      process.env['PROJECT_ID'] = originalEnv;
    }
  });

  describe('getProjectId', () => {
    describe('environment variable', () => {
      it('should return PROJECT_ID from environment when set', () => {
        process.env['PROJECT_ID'] = 'my-project';
        expect(getProjectId()).toBe('my-project');
        // Should not attempt auto-detection when env var is set
        expect(execSync).not.toHaveBeenCalled();
        expect(readFileSync).not.toHaveBeenCalled();
      });

      it('should handle PROJECT_ID with special characters', () => {
        process.env['PROJECT_ID'] = 'my-project-123_test';
        expect(getProjectId()).toBe('my-project-123_test');
      });

      it('should trim whitespace from PROJECT_ID', () => {
        process.env['PROJECT_ID'] = '  my-project  ';
        expect(getProjectId()).toBe('my-project');
      });

      it('should fall through when PROJECT_ID is only whitespace', () => {
        process.env['PROJECT_ID'] = '   ';
        vi.mocked(execSync).mockReturnValue('git@github.com:owner/repo.git\n');
        expect(getProjectId()).toBe('repo');
      });
    });

    describe('git remote auto-detection', () => {
      beforeEach(() => {
        delete process.env['PROJECT_ID'];
      });

      it('should detect project ID from SSH URL format', () => {
        vi.mocked(execSync).mockReturnValue('git@github.com:owner/repo.git\n');
        expect(getProjectId()).toBe('repo');
        expect(execSync).toHaveBeenCalledWith('git config --get remote.origin.url', {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
      });

      it('should detect project ID from HTTPS URL with .git suffix', () => {
        vi.mocked(execSync).mockReturnValue('https://github.com/owner/repo.git\n');
        expect(getProjectId()).toBe('repo');
      });

      it('should detect project ID from HTTPS URL without .git suffix', () => {
        vi.mocked(execSync).mockReturnValue('https://github.com/owner/repo\n');
        expect(getProjectId()).toBe('repo');
      });

      it('should fall back to package.json when git command fails', () => {
        vi.mocked(execSync).mockImplementation(() => {
          throw new Error('git not found');
        });
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'my-package' }));

        expect(getProjectId()).toBe('my-package');
        expect(execSync).toHaveBeenCalled();
        expect(readFileSync).toHaveBeenCalled();
      });

      it('should handle empty git output', () => {
        vi.mocked(execSync).mockReturnValue('');
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'my-package' }));

        expect(getProjectId()).toBe('my-package');
      });
    });

    describe('package.json auto-detection', () => {
      beforeEach(() => {
        delete process.env['PROJECT_ID'];
        // Make git detection fail to test package.json fallback
        vi.mocked(execSync).mockImplementation(() => {
          throw new Error('not a git repository');
        });
      });

      it('should detect project ID from package.json name', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'my-package' }));

        expect(getProjectId()).toBe('my-package');
        expect(readFileSync).toHaveBeenCalledWith(expect.stringContaining('package.json'), 'utf-8');
      });

      it('should strip @scope/ prefix from scoped packages', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: '@myorg/my-package' }));

        expect(getProjectId()).toBe('my-package');
      });

      it('should handle scoped packages with complex names', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: '@scope/my-complex-package-name' }));

        expect(getProjectId()).toBe('my-complex-package-name');
      });

      it('should fall back to "unknown" when package.json has no name', () => {
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ version: '1.0.0' }));

        expect(getProjectId()).toBe('unknown');
      });

      it('should fall back to "unknown" when package.json is invalid JSON', () => {
        vi.mocked(readFileSync).mockReturnValue('{ invalid json');

        expect(getProjectId()).toBe('unknown');
      });

      it('should fall back to "unknown" when package.json does not exist', () => {
        vi.mocked(readFileSync).mockImplementation(() => {
          throw new Error('ENOENT: no such file');
        });

        expect(getProjectId()).toBe('unknown');
      });
    });

    describe('fallback chain priority', () => {
      it('should prefer environment variable over git', () => {
        process.env['PROJECT_ID'] = 'env-project';
        vi.mocked(execSync).mockReturnValue('git@github.com:owner/git-project.git\n');

        expect(getProjectId()).toBe('env-project');
        expect(execSync).not.toHaveBeenCalled();
      });

      it('should prefer environment variable over package.json', () => {
        process.env['PROJECT_ID'] = 'env-project';
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'package-project' }));

        expect(getProjectId()).toBe('env-project');
        expect(readFileSync).not.toHaveBeenCalled();
      });

      it('should prefer git over package.json', () => {
        delete process.env['PROJECT_ID'];
        vi.mocked(execSync).mockReturnValue('git@github.com:owner/git-project.git\n');
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ name: 'package-project' }));

        expect(getProjectId()).toBe('git-project');
        expect(readFileSync).not.toHaveBeenCalled();
      });

      it('should return "unknown" when PROJECT_ID is empty string and all detection fails', () => {
        process.env['PROJECT_ID'] = '';
        vi.mocked(execSync).mockImplementation(() => {
          throw new Error('git failed');
        });
        vi.mocked(readFileSync).mockImplementation(() => {
          throw new Error('file not found');
        });

        expect(getProjectId()).toBe('unknown');
      });
    });
  });
});
