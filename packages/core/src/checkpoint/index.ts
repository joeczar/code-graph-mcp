// Checkpoint module - Workflow state persistence for resume capability

export {
  // Database
  getCheckpointDb,
  closeCheckpointDb,

  // Workflow operations
  createWorkflow,
  getWorkflow,
  findWorkflowByIssue,
  listWorkflows,
  setWorkflowPhase,
  setWorkflowStatus,
  setWorkflowPr,
  setWorkflowMerged,
  setWorkflowPrState,
  deleteWorkflow,

  // Action operations
  logAction,
  getActions,

  // Commit operations
  logCommit,
  getCommits,

  // Summary
  getWorkflowSummary,
} from './db.js';

export type {
  WorkflowStatus,
  WorkflowPhase,
  PrState,
  Workflow,
  WorkflowAction,
  WorkflowCommit,
  NewWorkflow,
  WorkflowSummary,
} from './db.js';
