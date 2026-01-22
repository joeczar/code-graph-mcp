import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runMetricsCommand } from '../metrics.js';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createMetricsStore,
  createMigrationRunner,
} from '@code-graph/core';

describe('runMetricsCommand', () => {
  beforeEach(() => {
    resetDatabase();
    const db = getDatabase();
    initializeSchema(db);

    // Run migrations to create metrics tables
    const migrationRunner = createMigrationRunner(db);
    migrationRunner.run();
  });

  afterEach(() => {
    resetDatabase();
    vi.restoreAllMocks();
  });

  describe('help', () => {
    it('shows help with no arguments', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand([]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Usage: code-graph-cli metrics')
      );
    });

    it('shows help with help argument', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['help']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Usage: code-graph-cli metrics')
      );
    });
  });

  describe('summary', () => {
    it('displays summary with no data', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tool Call Summary')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No tool call metrics found')
      );
    });

    it('displays tool call summary with data', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      // Insert test data
      metricsStore.insertToolCall('test-project', 'parse_file', 100, true);
      metricsStore.insertToolCall('test-project', 'parse_file', 200, true);
      metricsStore.insertToolCall('test-project', 'find_entity', 50, true);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tool Call Summary')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('parse_file')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('find_entity')
      );
    });

    it('displays parse stats summary with data', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      metricsStore.insertParseStats('test-project', 100, 95, 5, 450, 320, 3500);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Parse Stats Summary')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total Parse Runs')
      );
    });

    it('filters by project', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      metricsStore.insertToolCall('project-a', 'tool-a', 100, true);
      metricsStore.insertToolCall('project-b', 'tool-b', 200, true);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary', '--project', 'project-a']);

      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('tool-a');
      expect(output).not.toContain('tool-b');
    });

    it('filters by tool name', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      metricsStore.insertToolCall('test-project', 'parse_file', 100, true);
      metricsStore.insertToolCall('test-project', 'find_entity', 50, true);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary', '--tool', 'parse_file']);

      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).toContain('parse_file');
      expect(output).not.toContain('find_entity');
    });

    it('throws error for unknown options', () => {
      expect(() => {
        runMetricsCommand(['summary', '--unknown']);
      }).toThrow('Unknown option: --unknown');
    });

    it('outputs JSON format', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      metricsStore.insertToolCall('test-project', 'parse_file', 100, true);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary', '--json']);

      const jsonOutput = consoleSpy.mock.calls[0]?.[0] as string | undefined;
      expect(jsonOutput).toBeDefined();
      expect(typeof jsonOutput).toBe('string');
      if (jsonOutput) {
        const parsed: unknown = JSON.parse(jsonOutput);
        expect(parsed).toHaveProperty('toolCallSummary');
        expect(parsed).toHaveProperty('parseStatsSummary');
        expect(parsed).toHaveProperty('toolUsageRanking');
      }
    });

    it('shows summary help', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary', '--help']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Usage: code-graph-cli metrics summary')
      );
    });

    it('displays tool usage ranking', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      // Insert test data for multiple tools
      metricsStore.insertToolCall('test-project', 'parse_file', 100, true);
      metricsStore.insertToolCall('test-project', 'parse_file', 200, true);
      metricsStore.insertToolCall('test-project', 'parse_file', 150, true);
      metricsStore.insertToolCall('test-project', 'find_entity', 50, true);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Top 10 Most Used Tools')
      );
    });

    it('does not show parse stats or ranking when filtering by tool', () => {
      const db = getDatabase();
      const metricsStore = createMetricsStore(db);

      metricsStore.insertToolCall('test-project', 'parse_file', 100, true);
      metricsStore.insertParseStats('test-project', 100, 95, 5, 450, 320, 3500);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {
        // Mock implementation
      });

      runMetricsCommand(['summary', '--tool', 'parse_file']);

      const output = consoleSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(output).not.toContain('Parse Stats Summary');
      expect(output).not.toContain('Top 10 Most Used Tools');
    });
  });

  describe('unknown subcommand', () => {
    it('throws error for unknown subcommand', () => {
      expect(() => {
        runMetricsCommand(['unknown']);
      }).toThrow('Unknown metrics subcommand: unknown');
    });
  });
});
