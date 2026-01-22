/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from 'vitest';
import { instrumentHandler } from '../instrument.js';
import type { ToolHandler } from '../types.js';
import type { MetricsStore } from '../../../../core/src/db/metrics.js';
import { ToolExecutionError } from '../errors.js';
import { z } from 'zod';

function createMockMetricsStore(overrides: Partial<MetricsStore> = {}): MetricsStore {
  return {
    insertToolCall: vi.fn(() => ({
      id: '123',
      projectId: 'test-project',
      toolName: 'test-tool',
      timestamp: new Date().toISOString(),
      latencyMs: 100,
      success: true,
      errorType: null,
      inputSummary: null,
      outputSize: null,
    })),
    queryToolCalls: vi.fn(),
    insertParseStats: vi.fn(),
    queryParseStats: vi.fn(),
    getToolCallSummary: vi.fn(() => []),
    getParseStatsSummary: vi.fn(() => ({
      totalParseRuns: 0,
      totalFilesProcessed: 0,
      totalFilesSuccess: 0,
      totalFilesError: 0,
      totalEntitiesExtracted: 0,
      totalRelationshipsExtracted: 0,
      avgDurationMs: 0,
    })),
    getToolUsageRanking: vi.fn(() => []),
    ...overrides,
  };
}

describe('instrumentHandler', () => {
  describe('successful execution', () => {
    it('should call handler and record success metrics', async () => {
      const handler: ToolHandler<z.ZodObject<{ message: z.ZodString }>> = vi.fn(async () => ({
        content: [{ type: 'text' as const, text: 'success' }],
      }));

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');
      const result = await instrumented({ message: 'hello' });

      expect(result.content[0]?.text).toBe('success');
      // Handler is called with input and optional extra context (undefined in tests)
      expect(handler).toHaveBeenCalledWith({ message: 'hello' }, undefined);
      expect(metricsStore.insertToolCall).toHaveBeenCalledWith(
        'test-project',
        'test-tool',
        expect.any(Number),
        true,
        null,
        expect.any(String),
        7 // "success".length
      );
    });

    it('should measure execution time', async () => {
      const handler: ToolHandler<z.ZodObject<Record<string, never>>> = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { content: [{ type: 'text' as const, text: 'done' }] };
      });

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('slow-tool', handler, metricsStore, 'test-project');
      await instrumented({});

      expect(metricsStore.insertToolCall).toHaveBeenCalledWith(
        'test-project',
        'slow-tool',
        expect.any(Number),
        true,
        null,
        expect.any(String),
        4
      );

      const call = vi.mocked(metricsStore.insertToolCall).mock.calls[0];
      const latency = call?.[2];
      expect(latency).toBeGreaterThanOrEqual(40); // Allow some tolerance
    });

    it('should sanitize input for metrics', async () => {
      const handler: ToolHandler<z.ZodObject<{ apiKey: z.ZodString; data: z.ZodString }>> = vi.fn(
        async () => ({
          content: [{ type: 'text' as const, text: 'ok' }],
        })
      );

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');
      await instrumented({ apiKey: 'secret123', data: 'public' });

      const call = vi.mocked(metricsStore.insertToolCall).mock.calls[0];
      const inputSummary = call?.[5];
      expect(inputSummary).not.toContain('secret123');
      expect(inputSummary).toContain('[REDACTED]');
      expect(inputSummary).toContain('public');
    });

    it('should calculate output size from response text', async () => {
      const handler: ToolHandler<z.ZodObject<Record<string, never>>> = vi.fn(async () => ({
        content: [
          { type: 'text' as const, text: 'Hello' },
          { type: 'text' as const, text: 'World' },
        ],
      }));

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');
      await instrumented({});

      const call = vi.mocked(metricsStore.insertToolCall).mock.calls[0];
      const outputSize = call?.[6];
      expect(outputSize).toBe(10); // "Hello" (5) + "World" (5)
    });
  });

  describe('error handling', () => {
    it('should record failure metrics and rethrow error', async () => {
      const error = new ToolExecutionError('Operation failed');
      const handler: ToolHandler<z.ZodObject<Record<string, never>>> = vi.fn(async () => {
        throw error;
      });

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('failing-tool', handler, metricsStore, 'test-project');

      await expect(instrumented({})).rejects.toThrow('Operation failed');

      expect(metricsStore.insertToolCall).toHaveBeenCalledWith(
        'test-project',
        'failing-tool',
        expect.any(Number),
        false,
        'ExecutionError',
        expect.any(String),
        null
      );
    });

    it('should classify different error types', async () => {
      const error = new z.ZodError([]);
      const handler: ToolHandler<z.ZodObject<Record<string, never>>> = vi.fn(async () => {
        throw error;
      });

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');

      await expect(instrumented({})).rejects.toThrow();

      const call = vi.mocked(metricsStore.insertToolCall).mock.calls[0];
      const errorType = call?.[4];
      expect(errorType).toBe('ValidationError');
    });

    it('should handle errors thrown during metrics recording', async () => {
      const handler: ToolHandler<z.ZodObject<Record<string, never>>> = vi.fn(async () => ({
        content: [{ type: 'text' as const, text: 'ok' }],
      }));

      const metricsStore = createMockMetricsStore({
        insertToolCall: vi.fn(() => {
          throw new Error('Database connection failed');
        }),
      });

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');

      // Should still return handler result even if metrics fail
      const result = await instrumented({});
      expect(result.content[0]?.text).toBe('ok');
    });
  });

  describe('edge cases', () => {
    it('should handle empty response content', async () => {
      const handler: ToolHandler<z.ZodObject<Record<string, never>>> = vi.fn(async () => ({
        content: [],
      }));

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');
      const result = await instrumented({});

      expect(result.content).toEqual([]);
      expect(metricsStore.insertToolCall).toHaveBeenCalledWith(
        'test-project',
        'test-tool',
        expect.any(Number),
        true,
        null,
        expect.any(String),
        0
      );
    });

    it('should handle very large inputs', async () => {
      const handler: ToolHandler<z.ZodObject<{ data: z.ZodString }>> = vi.fn(async () => ({
        content: [{ type: 'text' as const, text: 'processed' }],
      }));

      const metricsStore = createMockMetricsStore();

      const instrumented = instrumentHandler('test-tool', handler, metricsStore, 'test-project');
      await instrumented({ data: 'x'.repeat(10000) });

      const call = vi.mocked(metricsStore.insertToolCall).mock.calls[0];
      const inputSummary = call?.[5];
      expect(inputSummary?.length).toBeLessThanOrEqual(210); // Truncated
    });
  });
});
