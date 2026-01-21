/**
 * Tool instrumentation for metrics collection
 *
 * Provides wrapper function that automatically collects metrics
 * for tool execution including timing, success/failure, and errors.
 */

import type { z } from 'zod';
import type { MetricsStore } from '@code-graph/core';
import type { ToolHandler, ToolResponse } from './types.js';
import { sanitizeInput } from './sanitize.js';
import { classifyError } from './error-classifier.js';
import { logger } from './logger.js';

/**
 * Wrap a tool handler with metrics instrumentation
 *
 * Measures execution time, tracks success/failure, classifies errors,
 * and stores metrics in the database. Sanitizes inputs and calculates
 * output sizes for observability.
 *
 * @param toolName - Name of the tool being instrumented
 * @param handler - Original tool handler function
 * @param metricsStore - Database store for metrics
 * @param projectId - Project identifier for multi-tenant tracking
 * @returns Instrumented handler that collects metrics
 */
export function instrumentHandler<TInput extends z.ZodType>(
  toolName: string,
  handler: ToolHandler<TInput>,
  metricsStore: MetricsStore,
  projectId: string
): ToolHandler<TInput> {
  return async (input: z.infer<TInput>): Promise<ToolResponse> => {
    const startTime = performance.now();
    let success = false;
    let errorType: string | null = null;
    let result: ToolResponse | undefined;

    try {
      // Execute the original handler
      result = await handler(input);
      success = true;
      return result;
    } catch (error) {
      // Classify error for metrics
      errorType = classifyError(error);
      // Re-throw to maintain original error handling
      throw error;
    } finally {
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      // Sanitize input for storage
      const inputSummary = sanitizeInput(input);

      // Calculate output size (total characters in all text content)
      const outputSize = result
        ? result.content.reduce((sum, item) => sum + item.text.length, 0)
        : null;

      // Record metrics (don't let this fail the tool call)
      try {
        metricsStore.insertToolCall(
          projectId,
          toolName,
          latencyMs,
          success,
          errorType,
          inputSummary,
          outputSize
        );
      } catch (metricsError) {
        // Log but don't fail the tool call if metrics recording fails
        logger.error('Failed to record tool metrics', { toolName, error: metricsError });
      }
    }
  };
}
