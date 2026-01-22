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

  // Milestone run operations
  createMilestoneRun,
  getMilestoneRun,
  findMilestoneRunByName,
  listMilestoneRuns,
  setMilestoneRunWave,
  incrementMilestoneRunCompleted,
  setMilestoneRunStatus,
  addMilestoneRunForceResolved,
  deleteMilestoneRun,

  // Worktree operations
  createWorktree,
  getWorktree,
  findWorktreeByIssue,
  listWorktrees,
  setWorktreeStatus,
  deleteWorktree,
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
  MilestoneRunStatus,
  MilestoneRun,
  NewMilestoneRun,
  WorktreeStatus,
  Worktree,
  NewWorktree,
} from './db.js';
