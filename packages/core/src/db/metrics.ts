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
}

export function createMetricsStore(db: Database.Database): MetricsStore {
  // Prepare all statements once at initialization for performance
  const insertToolCallStmt = db.prepare(`
    INSERT INTO tool_calls (
      id, project_id, tool_name, timestamp, latency_ms,
      success, error_type, input_summary, output_size
    )
    VALUES (?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
  `);

  const selectToolCallByIdStmt = db.prepare(
    'SELECT * FROM tool_calls WHERE id = ?'
  );

  // Query variations for tool_calls (4 combinations)
  const queryToolCallsAllStmt = db.prepare(
    'SELECT * FROM tool_calls ORDER BY timestamp DESC'
  );
  const queryToolCallsByProjectStmt = db.prepare(
    'SELECT * FROM tool_calls WHERE project_id = ? ORDER BY timestamp DESC'
  );
  const queryToolCallsByToolStmt = db.prepare(
    'SELECT * FROM tool_calls WHERE tool_name = ? ORDER BY timestamp DESC'
  );
  const queryToolCallsByBothStmt = db.prepare(
    'SELECT * FROM tool_calls WHERE project_id = ? AND tool_name = ? ORDER BY timestamp DESC'
  );

  const insertParseStatsStmt = db.prepare(`
    INSERT INTO parse_stats (
      id, project_id, timestamp, files_total, files_success,
      files_error, entities_extracted, relationships_extracted, duration_ms
    )
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `);

  const selectParseStatsByIdStmt = db.prepare(
    'SELECT * FROM parse_stats WHERE id = ?'
  );

  // Query variations for parse_stats (2 combinations)
  const queryParseStatsAllStmt = db.prepare(
    'SELECT * FROM parse_stats ORDER BY timestamp DESC'
  );
  const queryParseStatsByProjectStmt = db.prepare(
    'SELECT * FROM parse_stats WHERE project_id = ? ORDER BY timestamp DESC'
  );

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

      const row = selectToolCallByIdStmt.get(id) as ToolCallRow;
      return rowToToolCall(row);
    },

    queryToolCalls(projectId?: string, toolName?: string): ToolCall[] {
      let rows: ToolCallRow[];

      if (projectId && toolName) {
        rows = queryToolCallsByBothStmt.all(projectId, toolName) as ToolCallRow[];
      } else if (projectId) {
        rows = queryToolCallsByProjectStmt.all(projectId) as ToolCallRow[];
      } else if (toolName) {
        rows = queryToolCallsByToolStmt.all(toolName) as ToolCallRow[];
      } else {
        rows = queryToolCallsAllStmt.all() as ToolCallRow[];
      }

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

      const row = selectParseStatsByIdStmt.get(id) as ParseStatsRow;
      return rowToParseStats(row);
    },

    queryParseStats(projectId?: string): ParseStats[] {
      const rows = projectId
        ? (queryParseStatsByProjectStmt.all(projectId) as ParseStatsRow[])
        : (queryParseStatsAllStmt.all() as ParseStatsRow[]);

      return rows.map(rowToParseStats);
    },
  };
}
