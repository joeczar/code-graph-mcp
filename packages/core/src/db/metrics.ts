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
  };
}
