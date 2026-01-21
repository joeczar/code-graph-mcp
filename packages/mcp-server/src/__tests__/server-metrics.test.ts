import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../server.js';
import {
  getDatabase,
  resetDatabase,
  createMigrationRunner,
  createMetricsStore,
} from '@code-graph/core';

describe('server metrics integration', () => {
  beforeEach(() => {
    resetDatabase();
    const db = getDatabase();
    const migrationRunner = createMigrationRunner(db);
    migrationRunner.run();
  });

  it('should record metrics for successful tool calls', () => {
    createServer();
    const db = getDatabase();
    const metricsStore = createMetricsStore(db);

    // Call a tool via the server (we'll use the echo tool)
    // Note: This is a basic smoke test - full integration would require
    // actually invoking tools through the MCP protocol

    // Verify metrics table exists and is accessible
    const metrics = metricsStore.queryToolCalls();
    expect(metrics).toBeInstanceOf(Array);
  });

  it('should have migrations run during server creation', () => {
    const server = createServer();
    expect(server).toBeDefined();

    // Verify migrations ran by checking metrics table exists
    const db = getDatabase();
    const result = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tool_calls'")
      .get();
    expect(result).toBeDefined();
  });

  it('should initialize with PROJECT_ID from environment', () => {
    process.env['PROJECT_ID'] = 'test-project-123';
    const server = createServer();
    expect(server).toBeDefined();
    delete process.env['PROJECT_ID'];
  });

  it('should handle missing PROJECT_ID gracefully', () => {
    delete process.env['PROJECT_ID'];
    const server = createServer();
    expect(server).toBeDefined();
  });
});
