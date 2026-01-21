import { describe, it, expect } from 'vitest';
import { sanitizeInput } from '../sanitize.js';

describe('sanitizeInput', () => {
  describe('truncation', () => {
    it('should not truncate short inputs', () => {
      const input = { message: 'hello world' };
      const result = sanitizeInput(input);
      expect(result).toBe('{"message":"hello world"}');
    });

    it('should truncate long inputs to ~200 characters', () => {
      const longString = 'a'.repeat(500);
      const input = { data: longString };
      const result = sanitizeInput(input);
      expect(result.length).toBeLessThanOrEqual(210); // ~200 + ellipsis
      expect(result).toContain('...');
    });

    it('should handle inputs at exactly 200 characters', () => {
      const exactString = 'a'.repeat(180); // account for JSON overhead
      const input = { data: exactString };
      const result = sanitizeInput(input);
      expect(result.length).toBeLessThanOrEqual(210);
    });
  });

  describe('path conversion', () => {
    it('should convert absolute paths to relative', () => {
      const input = { path: '/home/user/project/src/file.ts' };
      const result = sanitizeInput(input);
      expect(result).not.toContain('/home/user');
      expect(result).toContain('src/file.ts');
    });

    it('should handle multiple paths in input', () => {
      const input = {
        source: '/home/user/project/src/a.ts',
        target: '/home/user/project/lib/b.ts',
      };
      const result = sanitizeInput(input);
      expect(result).not.toContain('/home/user');
      expect(result).toContain('src/a.ts');
      expect(result).toContain('lib/b.ts');
    });

    it('should preserve relative paths', () => {
      const input = { path: 'src/file.ts' };
      const result = sanitizeInput(input);
      expect(result).toContain('src/file.ts');
    });

    it('should handle Windows-style paths', () => {
      const input = { path: 'C:\\Users\\user\\project\\src\\file.ts' };
      const result = sanitizeInput(input);
      expect(result).not.toContain('C:\\Users');
      expect(result).toContain('src');
    });
  });

  describe('secret removal', () => {
    it('should redact API keys', () => {
      const input = { apiKey: 'sk_test_123456789', data: 'some data' };
      const result = sanitizeInput(input);
      expect(result).not.toContain('sk_test_123456789');
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('some data');
    });

    it('should redact tokens', () => {
      const input = { token: 'ghp_abcdefghijklmnop', message: 'test' };
      const result = sanitizeInput(input);
      expect(result).not.toContain('ghp_abcdefghijklmnop');
      expect(result).toContain('[REDACTED]');
    });

    it('should redact passwords', () => {
      const input = { password: 'secret123', username: 'user' };
      const result = sanitizeInput(input);
      expect(result).not.toContain('secret123');
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('user');
    });

    it('should redact multiple secret fields', () => {
      const input = {
        apiKey: 'key123',
        token: 'token456',
        password: 'pass789',
        data: 'public',
      };
      const result = sanitizeInput(input);
      expect(result).not.toContain('key123');
      expect(result).not.toContain('token456');
      expect(result).not.toContain('pass789');
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('public');
    });

    it('should handle nested secret fields', () => {
      const input = {
        config: {
          apiKey: 'secret',
          public: 'data',
        },
      };
      const result = sanitizeInput(input);
      expect(result).not.toContain('secret');
      expect(result).toContain('[REDACTED]');
      expect(result).toContain('data');
    });
  });

  describe('edge cases', () => {
    it('should handle empty objects', () => {
      const result = sanitizeInput({});
      expect(result).toBe('{}');
    });

    it('should handle null', () => {
      const result = sanitizeInput(null);
      expect(result).toBe('null');
    });

    it('should handle undefined', () => {
      const result = sanitizeInput(undefined);
      expect(result).toBe('undefined');
    });

    it('should handle arrays', () => {
      const input = ['a', 'b', 'c'];
      const result = sanitizeInput(input);
      expect(result).toContain('["a","b","c"]');
    });

    it('should handle primitive values', () => {
      expect(sanitizeInput('test')).toBe('"test"');
      expect(sanitizeInput(123)).toBe('123');
      expect(sanitizeInput(true)).toBe('true');
    });

    it('should handle circular references safely', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;
      const result = sanitizeInput(obj);
      expect(result).toBeTruthy();
      expect(result).toContain('[Circular]');
    });
  });
});
