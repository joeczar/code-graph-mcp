import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ============================================================================
// Types
// ============================================================================

export type WorkflowStatus = 'running' | 'paused' | 'completed' | 'failed';
export type WorkflowPhase = 'setup' | 'research' | 'implement' | 'review' | 'finalize' | 'merge';
export type PrState = 'open' | 'merged' | 'closed';
export type MilestoneRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'deadlocked';

export interface Workflow {
  id: string;
  issue_number: number;
  branch_name: string;
  status: WorkflowStatus;
  current_phase: WorkflowPhase;
  pr_number: number | null;
  pr_state: PrState | null;
  merged_sha: string | null;
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

export interface MilestoneRun {
  id: string;
  milestone_name: string;
  total_issues: number;
  completed_issues: number;
  current_wave: number;
  total_waves: number;
  wave_issues: string; // JSON: {"1": [12, 15], "2": [13], ...}
  parallel_setting: number;
  force_resolved: string | null; // JSON array of force-unblocked issues
  status: MilestoneRunStatus;
  created_at: string;
  updated_at: string;
}

export interface NewMilestoneRun {
  milestone_name: string;
  total_issues: number;
  total_waves: number;
  wave_issues: Record<number, number[]>;
  parallel_setting?: number;
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
  pr_number INTEGER,
  pr_state TEXT,
  merged_sha TEXT,
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

const MILESTONE_RUNS_TABLE = `
CREATE TABLE IF NOT EXISTS milestone_runs (
  id TEXT PRIMARY KEY,
  milestone_name TEXT NOT NULL,
  total_issues INTEGER NOT NULL,
  completed_issues INTEGER DEFAULT 0,
  current_wave INTEGER DEFAULT 1,
  total_waves INTEGER NOT NULL,
  wave_issues TEXT NOT NULL,
  parallel_setting INTEGER DEFAULT 1,
  force_resolved TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_workflows_issue ON workflows(issue_number)',
  'CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows(status)',
  'CREATE INDEX IF NOT EXISTS idx_workflows_pr ON workflows(pr_number)',
  'CREATE INDEX IF NOT EXISTS idx_actions_workflow ON workflow_actions(workflow_id)',
  'CREATE INDEX IF NOT EXISTS idx_commits_workflow ON workflow_commits(workflow_id)',
  'CREATE INDEX IF NOT EXISTS idx_commits_sha ON workflow_commits(sha)',
  'CREATE INDEX IF NOT EXISTS idx_milestone_runs_name ON milestone_runs(milestone_name)',
  'CREATE INDEX IF NOT EXISTS idx_milestone_runs_status ON milestone_runs(status)',
];

// Columns to add via migration (for existing databases)
const MIGRATION_COLUMNS = ['pr_number', 'pr_state', 'merged_sha'] as const;

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
  db.exec(MILESTONE_RUNS_TABLE);

  for (const index of INDEXES) {
    db.exec(index);
  }

  // Run migrations for existing databases - check column existence before adding
  runMigrations(db);
}

function runMigrations(db: Database.Database): void {
  // Get existing column names from workflows table
  const tableInfo = db.pragma('table_info(workflows)') as { name: string }[];
  const existingColumns = new Set(tableInfo.map((col) => col.name));

  // Add missing columns
  for (const column of MIGRATION_COLUMNS) {
    if (!existingColumns.has(column)) {
      const columnType = column === 'pr_number' ? 'INTEGER' : 'TEXT';
      db.exec(`ALTER TABLE workflows ADD COLUMN ${column} ${columnType}`);
    }
  }
}

// ============================================================================
// Workflow Operations
// ============================================================================

export function createWorkflow(db: Database.Database, data: NewWorkflow): Workflow {
  const id = randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO workflows (id, issue_number, branch_name, status, current_phase, pr_number, pr_state, merged_sha, created_at, updated_at)
    VALUES (?, ?, ?, 'running', 'setup', NULL, NULL, NULL, ?, ?)
  `);

  stmt.run(id, data.issue_number, data.branch_name, now, now);

  return {
    id,
    issue_number: data.issue_number,
    branch_name: data.branch_name,
    status: 'running',
    current_phase: 'setup',
    pr_number: null,
    pr_state: null,
    merged_sha: null,
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

export function setWorkflowPr(
  db: Database.Database,
  id: string,
  prNumber: number
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE workflows SET pr_number = ?, pr_state = 'open', updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(prNumber, now, id);
  return result.changes > 0;
}

export function setWorkflowMerged(
  db: Database.Database,
  id: string,
  mergedSha: string
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE workflows SET pr_state = 'merged', merged_sha = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(mergedSha, now, id);
  return result.changes > 0;
}

export function setWorkflowPrState(
  db: Database.Database,
  id: string,
  prState: PrState
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE workflows SET pr_state = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(prState, now, id);
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

// ============================================================================
// Milestone Run Operations
// ============================================================================

export function createMilestoneRun(
  db: Database.Database,
  data: NewMilestoneRun
): MilestoneRun {
  const id = randomUUID();
  const now = new Date().toISOString();
  const waveIssuesJson = JSON.stringify(data.wave_issues);
  const parallelSetting = data.parallel_setting ?? 1;

  const stmt = db.prepare(`
    INSERT INTO milestone_runs (id, milestone_name, total_issues, completed_issues, current_wave, total_waves, wave_issues, parallel_setting, force_resolved, status, created_at, updated_at)
    VALUES (?, ?, ?, 0, 1, ?, ?, ?, NULL, 'running', ?, ?)
  `);

  stmt.run(id, data.milestone_name, data.total_issues, data.total_waves, waveIssuesJson, parallelSetting, now, now);

  return {
    id,
    milestone_name: data.milestone_name,
    total_issues: data.total_issues,
    completed_issues: 0,
    current_wave: 1,
    total_waves: data.total_waves,
    wave_issues: waveIssuesJson,
    parallel_setting: parallelSetting,
    force_resolved: null,
    status: 'running',
    created_at: now,
    updated_at: now,
  };
}

export function getMilestoneRun(db: Database.Database, id: string): MilestoneRun | null {
  const stmt = db.prepare('SELECT * FROM milestone_runs WHERE id = ?');
  const row = stmt.get(id) as MilestoneRun | undefined;
  return row ?? null;
}

export function findMilestoneRunByName(
  db: Database.Database,
  milestoneName: string
): MilestoneRun | null {
  // Find the most recent running or paused milestone run with this name
  const stmt = db.prepare(`
    SELECT * FROM milestone_runs
    WHERE milestone_name = ? AND status IN ('running', 'paused', 'deadlocked')
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const row = stmt.get(milestoneName) as MilestoneRun | undefined;
  return row ?? null;
}

export function listMilestoneRuns(
  db: Database.Database,
  options?: { status?: MilestoneRunStatus; limit?: number }
): MilestoneRun[] {
  let query = 'SELECT * FROM milestone_runs';
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
  return stmt.all(...params) as MilestoneRun[];
}

export function setMilestoneRunWave(
  db: Database.Database,
  id: string,
  wave: number
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE milestone_runs SET current_wave = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(wave, now, id);
  return result.changes > 0;
}

export function incrementMilestoneRunCompleted(
  db: Database.Database,
  id: string
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE milestone_runs SET completed_issues = completed_issues + 1, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(now, id);
  return result.changes > 0;
}

export function setMilestoneRunStatus(
  db: Database.Database,
  id: string,
  status: MilestoneRunStatus
): boolean {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE milestone_runs SET status = ?, updated_at = ? WHERE id = ?
  `);
  const result = stmt.run(status, now, id);
  return result.changes > 0;
}

export function addMilestoneRunForceResolved(
  db: Database.Database,
  id: string,
  issueNumber: number
): boolean {
  const now = new Date().toISOString();

  // Use transaction to avoid race condition in read-modify-write
  const transaction = db.transaction(() => {
    const run = getMilestoneRun(db, id);
    if (!run) return false;

    const currentResolved: number[] = run.force_resolved
      ? (JSON.parse(run.force_resolved) as number[])
      : [];
    if (!currentResolved.includes(issueNumber)) {
      currentResolved.push(issueNumber);
    }

    const stmt = db.prepare(`
      UPDATE milestone_runs SET force_resolved = ?, updated_at = ? WHERE id = ?
    `);
    const result = stmt.run(JSON.stringify(currentResolved), now, id);
    return result.changes > 0;
  });

  return transaction();
}

export function deleteMilestoneRun(db: Database.Database, id: string): boolean {
  const stmt = db.prepare('DELETE FROM milestone_runs WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}
