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
});
