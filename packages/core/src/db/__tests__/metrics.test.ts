import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDatabase,
  resetDatabase,
  initializeSchema,
  createMetricsStore,
  createMigrationRunner,
} from '../index.js';
import type { MetricsStore } from '../metrics.js';

describe('MetricsStore', () => {
  let metricsStore: MetricsStore;

  beforeEach(() => {
    resetDatabase();
    const db = getDatabase();
    initializeSchema(db);

    // Run migrations to create metrics tables
    const migrationRunner = createMigrationRunner(db);
    migrationRunner.run();

    metricsStore = createMetricsStore(db);
  });

  afterEach(() => {
    resetDatabase();
  });

  describe('insertToolCall', () => {
    it('inserts a tool call record', () => {
      const result = metricsStore.insertToolCall(
        'test-project',
        'parse_file',
        150,
        true
      );

      expect(result.id).toBeDefined();
      expect(result.projectId).toBe('test-project');
      expect(result.toolName).toBe('parse_file');
      expect(result.latencyMs).toBe(150);
      expect(result.success).toBe(true);
      expect(result.errorType).toBeNull();
      expect(result.inputSummary).toBeNull();
      expect(result.outputSize).toBeNull();
      expect(result.timestamp).toBeDefined();
    });

    it('inserts tool call with optional fields', () => {
      const result = metricsStore.insertToolCall(
        'test-project',
        'parse_directory',
        2500,
        false,
        'FileNotFound',
        '/src/main.ts',
        1024
      );

      expect(result.id).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('FileNotFound');
      expect(result.inputSummary).toBe('/src/main.ts');
      expect(result.outputSize).toBe(1024);
    });
  });

  describe('queryToolCalls', () => {
    beforeEach(() => {
      // Insert test data
      metricsStore.insertToolCall('project-a', 'parse_file', 100, true);
      metricsStore.insertToolCall('project-a', 'parse_directory', 500, true);
      metricsStore.insertToolCall('project-b', 'parse_file', 150, false);
      metricsStore.insertToolCall('project-b', 'find_entity', 50, true);
    });

    it('returns all tool calls when no filters', () => {
      const results = metricsStore.queryToolCalls();
      expect(results).toHaveLength(4);
    });

    it('filters by project_id', () => {
      const results = metricsStore.queryToolCalls('project-a');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.projectId === 'project-a')).toBe(true);
    });

    it('filters by tool_name', () => {
      const results = metricsStore.queryToolCalls(undefined, 'parse_file');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.toolName === 'parse_file')).toBe(true);
    });

    it('filters by project_id and tool_name', () => {
      const results = metricsStore.queryToolCalls('project-a', 'parse_file');
      expect(results).toHaveLength(1);
      expect(results[0]?.projectId).toBe('project-a');
      expect(results[0]?.toolName).toBe('parse_file');
    });

    it('returns results in descending timestamp order', () => {
      const results = metricsStore.queryToolCalls();
      expect(results.length).toBeGreaterThan(0);
      // Most recent first (timestamp strings in ISO format are lexically comparable)
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]?.timestamp ?? '';
        const curr = results[i]?.timestamp ?? '';
        expect(prev >= curr).toBe(true);
      }
    });
  });

  describe('insertParseStats', () => {
    it('inserts a parse stats record', () => {
      const result = metricsStore.insertParseStats(
        'test-project',
        100,
        95,
        5,
        450,
        320,
        3500
      );

      expect(result.id).toBeDefined();
      expect(result.projectId).toBe('test-project');
      expect(result.filesTotal).toBe(100);
      expect(result.filesSuccess).toBe(95);
      expect(result.filesError).toBe(5);
      expect(result.entitiesExtracted).toBe(450);
      expect(result.relationshipsExtracted).toBe(320);
      expect(result.durationMs).toBe(3500);
      expect(result.timestamp).toBeDefined();
    });

    it('inserts multiple parse stats records', () => {
      metricsStore.insertParseStats('proj-1', 50, 50, 0, 200, 150, 1000);
      metricsStore.insertParseStats('proj-2', 75, 70, 5, 350, 280, 2000);

      const results = metricsStore.queryParseStats();
      expect(results).toHaveLength(2);
    });
  });

  describe('queryParseStats', () => {
    beforeEach(() => {
      // Insert test data
      metricsStore.insertParseStats('project-a', 100, 95, 5, 450, 320, 3500);
      metricsStore.insertParseStats('project-a', 50, 48, 2, 220, 180, 1800);
      metricsStore.insertParseStats('project-b', 200, 190, 10, 900, 750, 7000);
    });

    it('returns all parse stats when no filter', () => {
      const results = metricsStore.queryParseStats();
      expect(results).toHaveLength(3);
    });

    it('filters by project_id', () => {
      const results = metricsStore.queryParseStats('project-a');
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.projectId === 'project-a')).toBe(true);
    });

    it('returns results in descending timestamp order', () => {
      const results = metricsStore.queryParseStats();
      expect(results.length).toBeGreaterThan(0);
      // Most recent first (timestamp strings in ISO format are lexically comparable)
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]?.timestamp ?? '';
        const curr = results[i]?.timestamp ?? '';
        expect(prev >= curr).toBe(true);
      }
    });

    it('returns empty array for non-existent project', () => {
      const results = metricsStore.queryParseStats('non-existent');
      expect(results).toHaveLength(0);
    });
  });

  describe('getToolCallSummary', () => {
    beforeEach(() => {
      // Insert diverse test data
      metricsStore.insertToolCall('project-a', 'parse_file', 100, true);
      metricsStore.insertToolCall('project-a', 'parse_file', 200, true);
      metricsStore.insertToolCall('project-a', 'parse_file', 150, false, 'Error');
      metricsStore.insertToolCall('project-a', 'find_entity', 50, true);
      metricsStore.insertToolCall('project-b', 'parse_file', 300, true);
    });

    it('returns summary grouped by tool', () => {
      const summary = metricsStore.getToolCallSummary();
      expect(summary.length).toBeGreaterThan(0);

      const parseFileSummary = summary.find((s) => s.toolName === 'parse_file');
      expect(parseFileSummary).toBeDefined();
      expect(parseFileSummary?.callCount).toBe(4);
      expect(parseFileSummary?.successCount).toBe(3);
      expect(parseFileSummary?.errorCount).toBe(1);
      expect(parseFileSummary?.successRate).toBeCloseTo(0.75, 2);
    });

    it('calculates percentiles correctly', () => {
      const summary = metricsStore.getToolCallSummary();
      const parseFileSummary = summary.find((s) => s.toolName === 'parse_file');

      // parse_file latencies are [100, 150, 200, 300], sorted
      expect(parseFileSummary).toBeDefined();
      expect(parseFileSummary?.p50LatencyMs).toBeCloseTo(175, 0);
      expect(parseFileSummary?.p95LatencyMs).toBeCloseTo(285, 0);
      expect(parseFileSummary?.p99LatencyMs).toBeCloseTo(297, 0);
    });

    it('filters by project', () => {
      const summary = metricsStore.getToolCallSummary('project-a');
      const parseFileSummary = summary.find((s) => s.toolName === 'parse_file');
      expect(parseFileSummary?.callCount).toBe(3);
    });

    it('filters by tool name', () => {
      const summary = metricsStore.getToolCallSummary(undefined, 'find_entity');
      expect(summary).toHaveLength(1);
      expect(summary[0]?.toolName).toBe('find_entity');
      expect(summary[0]?.callCount).toBe(1);
    });

    it('returns empty array when no data matches', () => {
      const summary = metricsStore.getToolCallSummary('non-existent');
      expect(summary).toHaveLength(0);
    });
  });

  describe('getParseStatsSummary', () => {
    beforeEach(() => {
      metricsStore.insertParseStats('project-a', 100, 95, 5, 450, 320, 3500);
      metricsStore.insertParseStats('project-a', 50, 48, 2, 220, 180, 1800);
      metricsStore.insertParseStats('project-b', 200, 190, 10, 900, 750, 7000);
    });

    it('returns aggregated parse stats', () => {
      const summary = metricsStore.getParseStatsSummary();
      expect(summary.totalParseRuns).toBe(3);
      expect(summary.totalFilesProcessed).toBe(350);
      expect(summary.totalFilesSuccess).toBe(333);
      expect(summary.totalFilesError).toBe(17);
      expect(summary.totalEntitiesExtracted).toBe(1570);
      expect(summary.totalRelationshipsExtracted).toBe(1250);
    });

    it('calculates average duration', () => {
      const summary = metricsStore.getParseStatsSummary();
      const expectedAvg = (3500 + 1800 + 7000) / 3;
      expect(summary.avgDurationMs).toBeCloseTo(expectedAvg, 2);
    });

    it('filters by project', () => {
      const summary = metricsStore.getParseStatsSummary('project-a');
      expect(summary.totalParseRuns).toBe(2);
      expect(summary.totalFilesProcessed).toBe(150);
    });

    it('returns zero values when no data', () => {
      const summary = metricsStore.getParseStatsSummary('non-existent');
      expect(summary.totalParseRuns).toBe(0);
      expect(summary.totalFilesProcessed).toBe(0);
      expect(summary.avgDurationMs).toBe(0);
    });
  });

  describe('getToolUsageRanking', () => {
    beforeEach(() => {
      metricsStore.insertToolCall('project-a', 'parse_file', 100, true);
      metricsStore.insertToolCall('project-a', 'parse_file', 200, true);
      metricsStore.insertToolCall('project-a', 'parse_file', 150, true);
      metricsStore.insertToolCall('project-a', 'find_entity', 50, true);
      metricsStore.insertToolCall('project-b', 'parse_directory', 300, true);
      metricsStore.insertToolCall('project-b', 'parse_directory', 400, true);
    });

    it('returns tools ranked by call count', () => {
      const ranking = metricsStore.getToolUsageRanking();
      expect(ranking).toHaveLength(3);
      expect(ranking[0]?.toolName).toBe('parse_file');
      expect(ranking[0]?.callCount).toBe(3);
      expect(ranking[1]?.toolName).toBe('parse_directory');
      expect(ranking[1]?.callCount).toBe(2);
      expect(ranking[2]?.toolName).toBe('find_entity');
      expect(ranking[2]?.callCount).toBe(1);
    });

    it('filters by project', () => {
      const ranking = metricsStore.getToolUsageRanking('project-a');
      expect(ranking).toHaveLength(2);
      expect(ranking[0]?.toolName).toBe('parse_file');
      expect(ranking[1]?.toolName).toBe('find_entity');
    });

    it('limits results when specified', () => {
      const ranking = metricsStore.getToolUsageRanking(undefined, 2);
      expect(ranking).toHaveLength(2);
    });

    it('returns empty array when no data', () => {
      const ranking = metricsStore.getToolUsageRanking('non-existent');
      expect(ranking).toHaveLength(0);
    });
  });
});
