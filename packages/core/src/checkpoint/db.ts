import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type WorkflowStatus = 'running' | 'paused' | 'completed' | 'failed';
export type WorkflowPhase = 'setup' | 'research' | 'implement' | 'review' | 'finalize';

export interface Workflow {
  id: string;
  issue_number: number;
  branch_name: string;
  status: WorkflowStatus;
  current_phase: WorkflowPhase;
  created_at: string;
  updated_at: string;
}

export interface WorkflowAction {
  id: string;
  workflow_id: string;
  action_type: string;
  status: 'success' | 'failed' | 'skipped';
  details: string | null;
  created_at: string;
}

export interface WorkflowCommit {
  id: string;
  workflow_id: string;
  sha: string;
  message: string;
  created_at: string;
}

export interface NewWorkflow {
  issue_number: number;
  branch_name: string;
}

// ============================================================================
// Schema
// ============================================================================

const WORKFLOWS_TABLE = `
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  issue_number INTEGER NOT NULL UNIQUE,
  branch_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_phase TEXT NOT NULL DEFAULT 'setup',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

const WORKFLOW_ACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS workflow_actions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
)
`;

const WORKFLOW_COMMITS_TABLE = `
CREATE TABLE IF NOT EXISTS workflow_commits (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  sha TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
)
`;

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_workflows_issue ON workflows(issue_number)',
  'CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)',
  'CREATE INDEX IF NOT EXISTS idx_actions_workflow ON workflow_actions(workflow_id)',
  'CREATE INDEX IF NOT EXISTS idx_commits_workflow ON workflow_commits(workflow_id)',
  'CREATE INDEX IF NOT EXISTS idx_commits_sha ON workflow_commits(sha)',
];

// ============================================================================
// Database Connection
// ============================================================================

let dbInstance: Database.Database | null = null;
let currentDbPath: string | null = null;

export function getCheckpointDb(dbPath: string): Database.Database {
  if (dbInstance && currentDbPath === dbPath) {
    return dbInstance;
  }

  if (dbInstance) {
    dbInstance.close();
  }

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  currentDbPath = dbPath;

  // Initialize schema
  initializeCheckpointSchema(dbInstance);

  return dbInstance;
}

export function closeCheckpointDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentDbPath = null;
  }
}

function initializeCheckpointSchema(db: Database.Database): void {
  db.exec(WORKFLOWS_TABLE);
  db.exec(WORKFLOW_ACTIONS_TABLE);
  db.exec(WORKFLOW_COMMITS_TABLE);

  for (const index of INDEXES) {
    db.exec(index);
  }
}

// ============================================================================
// Workflow Operations
// ============================================================================

export function createWorkflow(db: Database.Database, data: NewWorkflow): Workflow {
  const id = randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO workflows (id, issue_number, branch_name, status, current_phase, created_at, updated_at)
    VALUES (?, ?, ?, 'running', 'setup', ?, ?)
  `);

  stmt.run(id, data.issue_number, data.branch_name, now, now);

  return {
    id,
    issue_number: data.issue_number,
    branch_name: data.branch_name,
    status: 'running',
    current_phase: 'setup',
    created_at: now,
    updated_at: now,
  };
}

export function getWorkflow(db: Database.Database, id: string): Workflow | null {
  const stmt = db.prepare('SELECT * FROM workflows WHERE id = ?');
  const row = stmt.get(id) as Workflow | undefined;
  return row ?? null;
}

export function findWorkflowByIssue(db: Database.Database, issueNumber: number): Workflow | null {
  const stmt = db.prepare('SELECT * FROM workflows WHERE issue_number = ?');
  const row = stmt.get(issueNumber) as Workflow | undefined;
  return row ?? null;
}

export function listWorkflows(
  db: Database.Database,
  options?: { status?: WorkflowStatus; limit?: number }
): Workflow[] {
  let query = 'SELECT * FROM workflows';
  const params: (string | number)[] = [];

  if (options?.status) {
    query += ' WHERE status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY updated_at DESC';

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params) as Workflow[];
}

export function setWorkflowPhase(
  db: Database.Database,
  id: string,
  phase: WorkflowPhase
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE workflows SET current_phase = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(phase, now, id);
  return result.changes > 0;
}

export function setWorkflowStatus(
  db: Database.Database,
  id: string,
  status: WorkflowStatus
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE workflows SET status = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(status, now, id);
  return result.changes > 0;
}

export function deleteWorkflow(db: Database.Database, id: string): boolean {
  const stmt = db.prepare('DELETE FROM workflows WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============================================================================
// Action Operations
// ============================================================================

export function logAction(
  db: Database.Database,
  workflowId: string,
  actionType: string,
  status: 'success' | 'failed' | 'skipped',
  details?: string
): WorkflowAction {
  const id = randomUUID();
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO workflow_actions (id, workflow_id, action_type, status, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, workflowId, actionType, status, details ?? null, now);

    db.prepare('UPDATE workflows SET updated_at = ? WHERE id = ?').run(now, workflowId);
  });
  transaction();

  return {
    id,
    workflow_id: workflowId,
    action_type: actionType,
    status,
    details: details ?? null,
    created_at: now,
  };
}

export function getActions(
  db: Database.Database,
  workflowId: string,
  options?: { limit?: number }
): WorkflowAction[] {
  let query = 'SELECT * FROM workflow_actions WHERE workflow_id = ? ORDER BY created_at DESC';
  const params: (string | number)[] = [workflowId];

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params) as WorkflowAction[];
}

// ============================================================================
// Commit Operations
// ============================================================================

export function logCommit(
  db: Database.Database,
  workflowId: string,
  sha: string,
  message: string
): WorkflowCommit {
  const id = randomUUID();
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO workflow_commits (id, workflow_id, sha, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, workflowId, sha, message, now);

    db.prepare('UPDATE workflows SET updated_at = ? WHERE id = ?').run(now, workflowId);
  });
  transaction();

  return {
    id,
    workflow_id: workflowId,
    sha,
    message,
    created_at: now,
  };
}

export function getCommits(
  db: Database.Database,
  workflowId: string,
  options?: { limit?: number }
): WorkflowCommit[] {
  let query = 'SELECT * FROM workflow_commits WHERE workflow_id = ? ORDER BY created_at DESC';
  const params: (string | number)[] = [workflowId];

  if (options?.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params) as WorkflowCommit[];
}

// ============================================================================
// Summary Operations
// ============================================================================

export interface WorkflowSummary {
  workflow: Workflow;
  actions: WorkflowAction[];
  commits: WorkflowCommit[];
}

export function getWorkflowSummary(
  db: Database.Database,
  id: string
): WorkflowSummary | null {
  const workflow = getWorkflow(db, id);
  if (!workflow) return null;

  return {
    workflow,
    actions: getActions(db, id, { limit: 10 }),
    commits: getCommits(db, id, { limit: 10 }),
  };
}
