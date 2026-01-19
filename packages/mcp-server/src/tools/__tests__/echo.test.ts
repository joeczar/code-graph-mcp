import { describe, it, expect } from 'vitest';
import { echoTool } from '../echo.js';

describe('echoTool', () => {
  describe('metadata', () => {
    it('should have correct name and description', () => {
      expect(echoTool.metadata.name).toBe('echo');
      expect(echoTool.metadata.description.toLowerCase()).toContain('echo');
    });

    it('should accept message parameter', () => {
      const parsed = echoTool.metadata.inputSchema.safeParse({
        message: 'test',
      });
      expect(parsed.success).toBe(true);
    });

    it('should reject missing message', () => {
      const parsed = echoTool.metadata.inputSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('should reject non-string message', () => {
      const parsed = echoTool.metadata.inputSchema.safeParse({
        message: 123,
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('handler', () => {
    it('should echo the provided message', async () => {
      const response = await echoTool.handler({ message: 'Hello, World!' });

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: Hello, World!',
          },
        ],
      });
    });

    it('should handle empty string', async () => {
      const response = await echoTool.handler({ message: '' });

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Echo: ',
          },
        ],
      });
    });

    it('should handle multi-line messages', async () => {
      const message = 'Line 1\nLine 2\nLine 3';
      const response = await echoTool.handler({ message });

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: `Echo: ${message}`,
          },
        ],
      });
    });

    it('should handle special characters', async () => {
      const message = 'Special: @#$%^&*()';
      const response = await echoTool.handler({ message });

      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: `Echo: ${message}`,
          },
        ],
      });
    });
  });
});
