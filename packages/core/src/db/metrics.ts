import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface ToolCall {
  id: string;
  projectId: string;
  toolName: string;
  timestamp: string;
  latencyMs: number;
  success: boolean;
  errorType: string | null;
  inputSummary: string | null;
  outputSize: number | null;
}

export interface ParseStats {
  id: string;
  projectId: string;
  timestamp: string;
  filesTotal: number;
  filesSuccess: number;
  filesError: number;
  entitiesExtracted: number;
  relationshipsExtracted: number;
  durationMs: number;
}

export interface ToolCallSummary {
  toolName: string;
  callCount: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgLatencyMs: number;
}

export interface ParseStatsSummary {
  totalParseRuns: number;
  totalFilesProcessed: number;
  totalFilesSuccess: number;
  totalFilesError: number;
  totalEntitiesExtracted: number;
  totalRelationshipsExtracted: number;
  avgDurationMs: number;
}

export interface ToolUsageRanking {
  toolName: string;
  callCount: number;
  avgLatencyMs: number;
}

interface ToolCallRow {
  id: string;
  project_id: string;
  tool_name: string;
  timestamp: string;
  latency_ms: number;
  success: number;
  error_type: string | null;
  input_summary: string | null;
  output_size: number | null;
}

interface ParseStatsRow {
  id: string;
  project_id: string;
  timestamp: string;
  files_total: number;
  files_success: number;
  files_error: number;
  entities_extracted: number;
  relationships_extracted: number;
  duration_ms: number;
}

function rowToToolCall(row: ToolCallRow): ToolCall {
  return {
    id: row.id,
    projectId: row.project_id,
    toolName: row.tool_name,
    timestamp: row.timestamp,
    latencyMs: row.latency_ms,
    success: row.success === 1,
    errorType: row.error_type,
    inputSummary: row.input_summary,
    outputSize: row.output_size,
  };
}

function rowToParseStats(row: ParseStatsRow): ParseStats {
  return {
    id: row.id,
    projectId: row.project_id,
    timestamp: row.timestamp,
    filesTotal: row.files_total,
    filesSuccess: row.files_success,
    filesError: row.files_error,
    entitiesExtracted: row.entities_extracted,
    relationshipsExtracted: row.relationships_extracted,
    durationMs: row.duration_ms,
  };
}

export interface MetricsStore {
  insertToolCall(
    projectId: string,
    toolName: string,
    latencyMs: number,
    success: boolean,
    errorType?: string | null,
    inputSummary?: string | null,
    outputSize?: number | null
  ): ToolCall;
  queryToolCalls(projectId?: string, toolName?: string): ToolCall[];
  insertParseStats(
    projectId: string,
    filesTotal: number,
    filesSuccess: number,
    filesError: number,
    entitiesExtracted: number,
    relationshipsExtracted: number,
    durationMs: number
  ): ParseStats;
  queryParseStats(projectId?: string): ParseStats[];
  getToolCallSummary(projectId?: string, toolName?: string): ToolCallSummary[];
  getParseStatsSummary(projectId?: string): ParseStatsSummary;
  getToolUsageRanking(projectId?: string, limit?: number): ToolUsageRanking[];
}

export function createMetricsStore(db: Database.Database): MetricsStore {
  const insertToolCallStmt = db.prepare(`
    INSERT INTO tool_calls (
      id, project_id, tool_name, timestamp, latency_ms,
      success, error_type, input_summary, output_size
    )
    VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
  `);

  const insertParseStatsStmt = db.prepare(`
    INSERT INTO parse_stats (
      id, project_id, timestamp, files_total, files_success,
      files_error, entities_extracted, relationships_extracted, duration_ms
    )
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `);

  return {
    insertToolCall(
      projectId: string,
      toolName: string,
      latencyMs: number,
      success: boolean,
      errorType: string | null = null,
      inputSummary: string | null = null,
      outputSize: number | null = null
    ): ToolCall {
      const id = randomUUID();
      insertToolCallStmt.run(
        id,
        projectId,
        toolName,
        latencyMs,
        success ? 1 : 0,
        errorType,
        inputSummary,
        outputSize
      );

      const selectStmt = db.prepare('SELECT * FROM tool_calls WHERE id = ?');
      const row = selectStmt.get(id) as ToolCallRow;
      return rowToToolCall(row);
    },

    queryToolCalls(projectId?: string, toolName?: string): ToolCall[] {
      let query = 'SELECT * FROM tool_calls WHERE 1=1';
      const params: string[] = [];

      if (projectId) {
        query += ' AND project_id = ?';
        params.push(projectId);
      }

      if (toolName) {
        query += ' AND tool_name = ?';
        params.push(toolName);
      }

      query += ' ORDER BY timestamp DESC';

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as ToolCallRow[];
      return rows.map(rowToToolCall);
    },

    insertParseStats(
      projectId: string,
      filesTotal: number,
      filesSuccess: number,
      filesError: number,
      entitiesExtracted: number,
      relationshipsExtracted: number,
      durationMs: number
    ): ParseStats {
      const id = randomUUID();
      insertParseStatsStmt.run(
        id,
        projectId,
        filesTotal,
        filesSuccess,
        filesError,
        entitiesExtracted,
        relationshipsExtracted,
        durationMs
      );

      const selectStmt = db.prepare('SELECT * FROM parse_stats WHERE id = ?');
      const row = selectStmt.get(id) as ParseStatsRow;
      return rowToParseStats(row);
    },

    queryParseStats(projectId?: string): ParseStats[] {
      let query = 'SELECT * FROM parse_stats WHERE 1=1';
      const params: string[] = [];

      if (projectId) {
        query += ' AND project_id = ?';
        params.push(projectId);
      }

      query += ' ORDER BY timestamp DESC';

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as ParseStatsRow[];
      return rows.map(rowToParseStats);
    },

    getToolCallSummary(
      projectId?: string,
      toolName?: string
    ): ToolCallSummary[] {
      // First get the grouped data
      let query = `
        SELECT
          tool_name,
          COUNT(*) as call_count,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
          AVG(latency_ms) as avg_latency_ms
        FROM tool_calls
        WHERE 1=1
      `;
      const params: string[] = [];

      if (projectId) {
        query += ' AND project_id = ?';
        params.push(projectId);
      }

      if (toolName) {
        query += ' AND tool_name = ?';
        params.push(toolName);
      }

      query += ' GROUP BY tool_name ORDER BY call_count DESC';

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as {
        tool_name: string;
        call_count: number;
        success_count: number;
        error_count: number;
        avg_latency_ms: number;
      }[];

      // Calculate percentiles for each tool
      return rows.map((row) => {
        // Get all latencies for this tool to calculate percentiles
        let percentileQuery = 'SELECT latency_ms FROM tool_calls WHERE tool_name = ?';
        const percentileParams: string[] = [row.tool_name];

        if (projectId) {
          percentileQuery += ' AND project_id = ?';
          percentileParams.push(projectId);
        }

        percentileQuery += ' ORDER BY latency_ms ASC';

        const percentileStmt = db.prepare(percentileQuery);
        const latencies = (
          percentileStmt.all(...percentileParams) as {
            latency_ms: number;
          }[]
        ).map((r) => r.latency_ms);

        const p50 = calculatePercentile(latencies, 50);
        const p95 = calculatePercentile(latencies, 95);
        const p99 = calculatePercentile(latencies, 99);

        return {
          toolName: row.tool_name,
          callCount: row.call_count,
          successCount: row.success_count,
          errorCount: row.error_count,
          successRate: row.call_count > 0 ? row.success_count / row.call_count : 0,
          p50LatencyMs: p50,
          p95LatencyMs: p95,
          p99LatencyMs: p99,
          avgLatencyMs: row.avg_latency_ms,
        };
      });
    },

    getParseStatsSummary(projectId?: string): ParseStatsSummary {
      let query = `
        SELECT
          COUNT(*) as total_parse_runs,
          COALESCE(SUM(files_total), 0) as total_files_processed,
          COALESCE(SUM(files_success), 0) as total_files_success,
          COALESCE(SUM(files_error), 0) as total_files_error,
          COALESCE(SUM(entities_extracted), 0) as total_entities_extracted,
          COALESCE(SUM(relationships_extracted), 0) as total_relationships_extracted,
          COALESCE(AVG(duration_ms), 0) as avg_duration_ms
        FROM parse_stats
        WHERE 1=1
      `;
      const params: string[] = [];

      if (projectId) {
        query += ' AND project_id = ?';
        params.push(projectId);
      }

      const stmt = db.prepare(query);
      const row = stmt.get(...params) as {
        total_parse_runs: number;
        total_files_processed: number;
        total_files_success: number;
        total_files_error: number;
        total_entities_extracted: number;
        total_relationships_extracted: number;
        avg_duration_ms: number;
      };

      return {
        totalParseRuns: row.total_parse_runs,
        totalFilesProcessed: row.total_files_processed,
        totalFilesSuccess: row.total_files_success,
        totalFilesError: row.total_files_error,
        totalEntitiesExtracted: row.total_entities_extracted,
        totalRelationshipsExtracted: row.total_relationships_extracted,
        avgDurationMs: row.avg_duration_ms,
      };
    },

    getToolUsageRanking(
      projectId?: string,
      limit?: number
    ): ToolUsageRanking[] {
      let query = `
        SELECT
          tool_name,
          COUNT(*) as call_count,
          AVG(latency_ms) as avg_latency_ms
        FROM tool_calls
        WHERE 1=1
      `;
      const params: (string | number)[] = [];

      if (projectId) {
        query += ' AND project_id = ?';
        params.push(projectId);
      }

      query += ' GROUP BY tool_name ORDER BY call_count DESC';

      if (limit !== undefined) {
        query += ' LIMIT ?';
        params.push(limit);
      }

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as {
        tool_name: string;
        call_count: number;
        avg_latency_ms: number;
      }[];

      return rows.map((row) => ({
        toolName: row.tool_name,
        callCount: row.call_count,
        avgLatencyMs: row.avg_latency_ms,
      }));
    },
  };
}

/**
 * Calculate percentile from sorted array of numbers
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const index = (percentile / 100) * (values.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return values[lower] ?? 0;
  }

  return ((values[lower] ?? 0) * (1 - weight)) + ((values[upper] ?? 0) * weight);
}
