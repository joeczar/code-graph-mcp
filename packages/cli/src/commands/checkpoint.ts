/**
 * Checkpoint CLI commands
 *
 * Manages workflow state for resume capability.
 */

import { join } from 'node:path';
import {
  getCheckpointDb,
  closeCheckpointDb,
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
  logAction,
  logCommit,
  getWorkflowSummary,
  createMilestoneRun,
  getMilestoneRun,
  findMilestoneRunByName,
  listMilestoneRuns,
  setMilestoneRunWave,
  incrementMilestoneRunCompleted,
  setMilestoneRunStatus,
  addMilestoneRunForceResolved,
  deleteMilestoneRun,
  createWorktree,
  getWorktree,
  findWorktreeByIssue,
  listWorktrees,
  setWorktreeStatus,
  deleteWorktree,
  type WorkflowPhase,
  type WorkflowStatus,
  type PrState,
  type MilestoneRunStatus,
  type WorktreeStatus,
} from '@code-graph/core/checkpoint';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DB_PATH = join(process.cwd(), '.claude', 'execution-state.db');

const WORKFLOW_STATUSES: WorkflowStatus[] = ['running', 'paused', 'completed', 'failed'];
const WORKFLOW_PHASES: WorkflowPhase[] = ['setup', 'research', 'implement', 'review', 'finalize', 'merge'];
const PR_STATES: PrState[] = ['open', 'merged', 'closed'];
const MILESTONE_STATUSES: MilestoneRunStatus[] = ['running', 'paused', 'completed', 'failed', 'deadlocked'];
const WORKTREE_STATUSES: WorktreeStatus[] = ['created', 'running', 'pr-created', 'merged', 'failed'];
const ACTION_STATUSES = ['success', 'failed', 'skipped'] as const;

// ============================================================================
// Helpers
// ============================================================================

function getDb(): ReturnType<typeof getCheckpointDb> {
  const envPath = process.env['CHECKPOINT_DB_PATH'];
  return getCheckpointDb(envPath ?? DEFAULT_DB_PATH);
}

function parseIntRequired(value: string | undefined, name: string): number {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`${name} must be a number`);
  }
  return num;
}

function validateEnum<T extends string>(value: string, validValues: readonly T[], name: string): T {
  if (!validValues.includes(value as T)) {
    throw new Error(`Invalid ${name}: ${value}\nValid values: ${validValues.join(', ')}`);
  }
  return value as T;
}

function parseListOptions<T extends string>(
  args: string[],
  validStatuses: readonly T[]
): { status?: T; limit?: number } {
  const statusArg = args.find((a) => a.startsWith('--status='));
  const statusValue = statusArg?.split('=')[1];

  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limitValue = limitArg?.split('=')[1];

  const options: { status?: T; limit?: number } = {};

  if (statusValue) {
    if (!validStatuses.includes(statusValue as T)) {
      throw new Error(`Invalid status: "${statusValue}"\nValid values: ${validStatuses.join(', ')}`);
    }
    options.status = statusValue as T;
  }

  if (limitValue) {
    const limit = parseInt(limitValue, 10);
    if (isNaN(limit)) {
      throw new Error(`Invalid limit: "${limitValue}" is not a number`);
    }
    if (limit <= 0) {
      throw new Error(`Invalid limit: must be a positive number`);
    }
    options.limit = limit;
  }

  return options;
}

function updateAndLog(
  id: string,
  updateFn: () => boolean,
  getFn: () => unknown,
  entityName: string
): void {
  if (updateFn()) {
    const entity = getFn();
    console.log(JSON.stringify(entity, null, 2));
  } else {
    throw new Error(`${entityName} not found: ${id}`);
  }
}

function deleteAndLog(
  id: string,
  deleteFn: () => boolean,
  entityName: string
): void {
  if (deleteFn()) {
    console.log(`Deleted ${entityName}: ${id}`);
  } else {
    throw new Error(`${entityName} not found: ${id}`);
  }
}

export function runCheckpointCommand(args: string[]): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    printCheckpointHelp();
    return;
  }

  if (subcommand !== 'workflow' && subcommand !== 'milestone' && subcommand !== 'worktree') {
    throw new Error(`Unknown checkpoint subcommand: ${subcommand}\nUse: checkpoint workflow|milestone|worktree <action>`);
  }

  const action = args[1];
  if (!action) {
    printCheckpointHelp();
    throw new Error(`Usage: checkpoint ${subcommand} <action>`);
  }
  const actionArgs = args.slice(2);

  try {
    if (subcommand === 'workflow') {
      handleWorkflowAction(action, actionArgs);
    } else if (subcommand === 'milestone') {
      handleMilestoneAction(action, actionArgs);
    } else {
      handleWorktreeAction(action, actionArgs);
    }
  } finally {
    closeCheckpointDb();
  }
}

// ============================================================================
// Workflow Actions
// ============================================================================

function handleWorkflowAction(action: string, args: string[]): void {
  const db = getDb();

  switch (action) {
    case 'create': {
      const [issueNumberStr, branchName] = args;
      if (!branchName) {
        throw new Error('Usage: checkpoint workflow create <issue_number> <branch_name>');
      }
      const issueNumber = parseIntRequired(issueNumberStr, 'issue_number');

      const existing = findWorkflowByIssue(db, issueNumber);
      if (existing) {
        console.log(JSON.stringify(existing, null, 2));
        throw new Error(`Workflow already exists for issue #${String(issueNumber)}`);
      }

      const workflow = createWorkflow(db, { issue_number: issueNumber, branch_name: branchName });
      console.log(JSON.stringify(workflow, null, 2));
      break;
    }

    case 'find': {
      const issueNumber = parseIntRequired(args[0], 'issue_number');
      const workflow = findWorkflowByIssue(db, issueNumber);
      console.log(workflow ? JSON.stringify(workflow, null, 2) : 'null');
      break;
    }

    case 'get': {
      const [workflowId] = args;
      if (!workflowId) {
        throw new Error('Usage: checkpoint workflow get <workflow_id>');
      }
      const summary = getWorkflowSummary(db, workflowId);
      console.log(summary ? JSON.stringify(summary, null, 2) : 'null');
      break;
    }

    case 'list': {
      const options = parseListOptions(args, WORKFLOW_STATUSES);
      const workflows = listWorkflows(db, options);
      console.log(JSON.stringify(workflows, null, 2));
      break;
    }

    case 'set-phase': {
      const [workflowId, phase] = args;
      if (!workflowId || !phase) {
        throw new Error(`Usage: checkpoint workflow set-phase <workflow_id> <phase>\nPhases: ${WORKFLOW_PHASES.join(', ')}`);
      }
      const validPhase = validateEnum(phase, WORKFLOW_PHASES, 'phase');
      updateAndLog(
        workflowId,
        () => setWorkflowPhase(db, workflowId, validPhase),
        () => getWorkflow(db, workflowId),
        'Workflow'
      );
      break;
    }

    case 'set-status': {
      const [workflowId, status] = args;
      if (!workflowId || !status) {
        throw new Error(`Usage: checkpoint workflow set-status <workflow_id> <status>\nStatuses: ${WORKFLOW_STATUSES.join(', ')}`);
      }
      const validStatus = validateEnum(status, WORKFLOW_STATUSES, 'status');
      updateAndLog(
        workflowId,
        () => setWorkflowStatus(db, workflowId, validStatus),
        () => getWorkflow(db, workflowId),
        'Workflow'
      );
      break;
    }

    case 'set-pr': {
      const [workflowId, prNumberStr] = args;
      if (!workflowId) {
        throw new Error('Usage: checkpoint workflow set-pr <workflow_id> <pr_number>');
      }
      const prNumber = parseIntRequired(prNumberStr, 'pr_number');
      updateAndLog(
        workflowId,
        () => setWorkflowPr(db, workflowId, prNumber),
        () => getWorkflow(db, workflowId),
        'Workflow'
      );
      break;
    }

    case 'set-merged': {
      const [workflowId, mergedSha] = args;
      if (!workflowId || !mergedSha) {
        throw new Error('Usage: checkpoint workflow set-merged <workflow_id> <merged_sha>');
      }
      updateAndLog(
        workflowId,
        () => setWorkflowMerged(db, workflowId, mergedSha),
        () => getWorkflow(db, workflowId),
        'Workflow'
      );
      break;
    }

    case 'set-pr-state': {
      const [workflowId, prState] = args;
      if (!workflowId || !prState) {
        throw new Error(`Usage: checkpoint workflow set-pr-state <workflow_id> <pr_state>\nPR states: ${PR_STATES.join(', ')}`);
      }
      const validPrState = validateEnum(prState, PR_STATES, 'PR state');
      updateAndLog(
        workflowId,
        () => setWorkflowPrState(db, workflowId, validPrState),
        () => getWorkflow(db, workflowId),
        'Workflow'
      );
      break;
    }

    case 'log-action': {
      const [workflowId, actionType, status, ...detailsParts] = args;
      if (!workflowId || !actionType || !status) {
        throw new Error(`Usage: checkpoint workflow log-action <workflow_id> <action_type> <status> [details]\nStatus: ${ACTION_STATUSES.join(', ')}`);
      }
      const validStatus = validateEnum(status, ACTION_STATUSES, 'status');
      const details = detailsParts.length > 0 ? detailsParts.join(' ') : undefined;
      const loggedAction = logAction(db, workflowId, actionType, validStatus, details);
      console.log(JSON.stringify(loggedAction, null, 2));
      break;
    }

    case 'log-commit': {
      const [workflowId, sha, ...messageParts] = args;
      if (!workflowId || !sha || messageParts.length === 0) {
        throw new Error('Usage: checkpoint workflow log-commit <workflow_id> <sha> <message>');
      }

      const message = messageParts.join(' ');
      const commit = logCommit(db, workflowId, sha, message);
      console.log(JSON.stringify(commit, null, 2));
      break;
    }

    case 'delete': {
      const [workflowId] = args;
      if (!workflowId) {
        throw new Error('Usage: checkpoint workflow delete <workflow_id>');
      }
      deleteAndLog(workflowId, () => deleteWorkflow(db, workflowId), 'workflow');
      break;
    }

    default:
      printCheckpointHelp();
      throw new Error(`Unknown workflow action: ${action}`);
  }
}

// ============================================================================
// Milestone Actions
// ============================================================================

function handleMilestoneAction(action: string, args: string[]): void {
  const db = getDb();

  switch (action) {
    case 'create': {
      const [milestoneName, ...rest] = args;
      if (!milestoneName) {
        throw new Error('Usage: checkpoint milestone create "<name>" --waves \'<json>\' [--parallel N]');
      }

      // Parse --waves argument
      const wavesIdx = rest.indexOf('--waves');
      const wavesJson = wavesIdx !== -1 ? rest[wavesIdx + 1] : undefined;
      if (!wavesJson) {
        throw new Error('Missing --waves argument. Usage: checkpoint milestone create "<name>" --waves \'{"1": [12], "2": [13]}\'');
      }
      let waveIssues: Record<string, number[]>;
      try {
        const parsed: unknown = JSON.parse(wavesJson);
        // Validate structure: must be an object with string keys and number[] values
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('Must be an object');
        }
        for (const [key, value] of Object.entries(parsed)) {
          if (!/^\d+$/.test(key)) {
            throw new Error(`Key "${key}" must be a numeric string`);
          }
          if (!Array.isArray(value) || !value.every((v) => typeof v === 'number')) {
            throw new Error(`Value for key "${key}" must be an array of numbers`);
          }
        }
        waveIssues = parsed as Record<string, number[]>;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Parse error';
        throw new Error(`Invalid JSON for --waves: ${wavesJson}\n${msg}`);
      }

      // Parse --parallel argument (optional)
      const parallelIdx = rest.indexOf('--parallel');
      const parallelArg = parallelIdx !== -1 ? rest[parallelIdx + 1] : undefined;
      let parallelSetting = 1;
      if (parallelArg) {
        parallelSetting = parseInt(parallelArg, 10);
        if (isNaN(parallelSetting) || parallelSetting < 1) {
          throw new Error('--parallel must be a positive number');
        }
      }

      // Calculate totals
      const numericWaveIssues: Record<number, number[]> = {};
      let totalIssues = 0;
      let totalWaves = 0;
      for (const [waveStr, issues] of Object.entries(waveIssues)) {
        const waveNum = parseInt(waveStr, 10);
        numericWaveIssues[waveNum] = issues;
        totalIssues += issues.length;
        if (waveNum > totalWaves) totalWaves = waveNum;
      }

      const run = createMilestoneRun(db, {
        milestone_name: milestoneName,
        total_issues: totalIssues,
        total_waves: totalWaves,
        wave_issues: numericWaveIssues,
        parallel_setting: parallelSetting,
      });
      console.log(JSON.stringify(run, null, 2));
      break;
    }

    case 'find': {
      const [milestoneName] = args;
      if (!milestoneName) {
        throw new Error('Usage: checkpoint milestone find "<name>"');
      }
      const run = findMilestoneRunByName(db, milestoneName);
      console.log(run ? JSON.stringify(run, null, 2) : 'null');
      break;
    }

    case 'get': {
      const [runId] = args;
      if (!runId) {
        throw new Error('Usage: checkpoint milestone get <run_id>');
      }
      const run = getMilestoneRun(db, runId);
      console.log(run ? JSON.stringify(run, null, 2) : 'null');
      break;
    }

    case 'list': {
      const options = parseListOptions(args, MILESTONE_STATUSES);
      const runs = listMilestoneRuns(db, options);
      console.log(JSON.stringify(runs, null, 2));
      break;
    }

    case 'set-wave': {
      const [runId, waveStr] = args;
      if (!runId) {
        throw new Error('Usage: checkpoint milestone set-wave <run_id> <wave>');
      }
      const wave = parseIntRequired(waveStr, 'wave');
      updateAndLog(
        runId,
        () => setMilestoneRunWave(db, runId, wave),
        () => getMilestoneRun(db, runId),
        'Milestone run'
      );
      break;
    }

    case 'complete-issue': {
      const [runId] = args;
      if (!runId) {
        throw new Error('Usage: checkpoint milestone complete-issue <run_id>');
      }
      updateAndLog(
        runId,
        () => incrementMilestoneRunCompleted(db, runId),
        () => getMilestoneRun(db, runId),
        'Milestone run'
      );
      break;
    }

    case 'set-status': {
      const [runId, status] = args;
      if (!runId || !status) {
        throw new Error(`Usage: checkpoint milestone set-status <run_id> <status>\nStatuses: ${MILESTONE_STATUSES.join(', ')}`);
      }
      const validStatus = validateEnum(status, MILESTONE_STATUSES, 'status');
      updateAndLog(
        runId,
        () => setMilestoneRunStatus(db, runId, validStatus),
        () => getMilestoneRun(db, runId),
        'Milestone run'
      );
      break;
    }

    case 'add-force-resolved': {
      const [runId, issueNumberStr] = args;
      if (!runId) {
        throw new Error('Usage: checkpoint milestone add-force-resolved <run_id> <issue_number>');
      }
      const issueNumber = parseIntRequired(issueNumberStr, 'issue_number');
      updateAndLog(
        runId,
        () => addMilestoneRunForceResolved(db, runId, issueNumber),
        () => getMilestoneRun(db, runId),
        'Milestone run'
      );
      break;
    }

    case 'delete': {
      const [runId] = args;
      if (!runId) {
        throw new Error('Usage: checkpoint milestone delete <run_id>');
      }
      deleteAndLog(runId, () => deleteMilestoneRun(db, runId), 'milestone run');
      break;
    }

    default:
      printCheckpointHelp();
      throw new Error(`Unknown milestone action: ${action}`);
  }
}

// ============================================================================
// Worktree Actions
// ============================================================================

function handleWorktreeAction(action: string, args: string[]): void {
  const db = getDb();

  switch (action) {
    case 'create': {
      const [workflowId, issueNumberStr, branchName, worktreePath] = args;
      if (!workflowId || !issueNumberStr || !branchName || !worktreePath) {
        throw new Error('Usage: checkpoint worktree create <workflow_id> <issue_number> <branch_name> <worktree_path>');
      }
      const issueNumber = parseIntRequired(issueNumberStr, 'issue_number');

      const existing = findWorktreeByIssue(db, issueNumber);
      if (existing) {
        console.log(JSON.stringify(existing, null, 2));
        throw new Error(`Worktree already exists for issue #${String(issueNumber)}`);
      }

      const worktree = createWorktree(db, {
        workflow_id: workflowId,
        issue_number: issueNumber,
        branch_name: branchName,
        worktree_path: worktreePath,
      });
      console.log(JSON.stringify(worktree, null, 2));
      break;
    }

    case 'find': {
      const issueNumber = parseIntRequired(args[0], 'issue_number');
      const worktree = findWorktreeByIssue(db, issueNumber);
      console.log(worktree ? JSON.stringify(worktree, null, 2) : 'null');
      break;
    }

    case 'get': {
      const [worktreeId] = args;
      if (!worktreeId) {
        throw new Error('Usage: checkpoint worktree get <worktree_id>');
      }
      const worktree = getWorktree(db, worktreeId);
      console.log(worktree ? JSON.stringify(worktree, null, 2) : 'null');
      break;
    }

    case 'list': {
      const options = parseListOptions(args, WORKTREE_STATUSES);
      const worktrees = listWorktrees(db, options);
      console.log(JSON.stringify(worktrees, null, 2));
      break;
    }

    case 'update': {
      const [issueNumberStr, status, prNumberStr] = args;
      if (!issueNumberStr || !status) {
        throw new Error(`Usage: checkpoint worktree update <issue_number> <status> [pr_number]\nStatuses: ${WORKTREE_STATUSES.join(', ')}`);
      }
      const issueNumber = parseIntRequired(issueNumberStr, 'issue_number');
      const validStatus = validateEnum(status, WORKTREE_STATUSES, 'status');
      const prNumber = prNumberStr ? parseIntRequired(prNumberStr, 'pr_number') : undefined;

      if (setWorktreeStatus(db, issueNumber, validStatus, prNumber)) {
        const worktree = findWorktreeByIssue(db, issueNumber);
        console.log(JSON.stringify(worktree, null, 2));
      } else {
        throw new Error(`Worktree not found for issue #${String(issueNumber)}`);
      }
      break;
    }

    case 'remove': {
      const issueNumber = parseIntRequired(args[0], 'issue_number');
      deleteAndLog(String(issueNumber), () => deleteWorktree(db, issueNumber), `worktree for issue #${String(issueNumber)}`);
      break;
    }

    default:
      printCheckpointHelp();
      throw new Error(`Unknown worktree action: ${action}`);
  }
}

function printCheckpointHelp(): void {
  console.log(`
checkpoint - Manage workflow, milestone, and worktree state

USAGE:
  code-graph checkpoint workflow <action> [args]
  code-graph checkpoint milestone <action> [args]
  code-graph checkpoint worktree <action> [args]

=== WORKFLOW ACTIONS ===

  create <issue_number> <branch_name>
    Create a new workflow for an issue.
    Returns the created workflow with its ID.

  find <issue_number>
    Find workflow by issue number.
    Returns the workflow or null.

  get <workflow_id>
    Get full workflow details including recent actions and commits.

  list [--status=<status>] [--limit=<n>]
    List workflows. Optionally filter by status.
    Statuses: running, paused, completed, failed

  set-phase <workflow_id> <phase>
    Update workflow phase.
    Phases: setup, research, implement, review, finalize, merge

  set-status <workflow_id> <status>
    Update workflow status.
    Statuses: running, paused, completed, failed

  set-pr <workflow_id> <pr_number>
    Set the PR number for a workflow (sets pr_state to 'open').
    Call this after creating a PR for the workflow.

  set-merged <workflow_id> <merged_sha>
    Mark a workflow's PR as merged with the squash commit SHA.
    Sets pr_state to 'merged'.

  set-pr-state <workflow_id> <pr_state>
    Update the PR state directly.
    States: open, merged, closed

  log-action <workflow_id> <action_type> <status> [details]
    Log an action taken during the workflow.
    Status: success, failed, skipped

  log-commit <workflow_id> <sha> <message>
    Log a commit made during the workflow.

  delete <workflow_id>
    Delete a workflow and all its actions/commits.

=== MILESTONE ACTIONS ===

  create "<name>" --waves '<json>' [--parallel N]
    Create a new milestone run.
    Waves JSON format: {"1": [12, 15], "2": [13], "3": [14]}

  find "<name>"
    Find active milestone run by name (running, paused, or deadlocked).
    Returns the milestone run or null.

  get <run_id>
    Get milestone run details by ID.

  list [--status=<status>] [--limit=<n>]
    List milestone runs. Optionally filter by status.
    Statuses: running, paused, completed, failed, deadlocked

  set-wave <run_id> <wave>
    Update the current wave number.

  complete-issue <run_id>
    Increment the completed issues count.

  set-status <run_id> <status>
    Update milestone run status.
    Statuses: running, paused, completed, failed, deadlocked

  add-force-resolved <run_id> <issue_number>
    Mark an issue as force-resolved (unblocked manually).

  delete <run_id>
    Delete a milestone run.

=== WORKTREE ACTIONS ===

  create <workflow_id> <issue_number> <branch_name> <worktree_path>
    Create a worktree entry linked to a workflow.
    Returns the created worktree with its ID.

  find <issue_number>
    Find worktree by issue number.
    Returns the worktree or null.

  get <worktree_id>
    Get worktree details by ID.

  list [--status=<status>] [--limit=<n>]
    List worktrees. Optionally filter by status.
    Statuses: created, running, pr-created, merged, failed

  update <issue_number> <status> [pr_number]
    Update worktree status and optionally set PR number.
    Statuses: created, running, pr-created, merged, failed

  remove <issue_number>
    Delete a worktree entry.

=== WORKFLOW EXAMPLES ===

  # Start working on issue #12
  code-graph checkpoint workflow create 12 "feat/12-add-parser"

  # Check if issue already has a workflow
  code-graph checkpoint workflow find 12

  # Update phase after completing research
  code-graph checkpoint workflow set-phase abc-123 implement

  # Log a commit
  code-graph checkpoint workflow log-commit abc-123 a1b2c3d "feat(parser): add TS support"

  # Set PR number after creating PR
  code-graph checkpoint workflow set-pr abc-123 42

  # Mark PR as merged after /auto-merge
  code-graph checkpoint workflow set-merged abc-123 a1b2c3d4e5f6

  # Mark workflow complete
  code-graph checkpoint workflow set-status abc-123 completed

=== MILESTONE EXAMPLES ===

  # Create a milestone run with wave structure
  code-graph checkpoint milestone create "M3: Code Graph" --waves '{"1": [12, 15], "2": [13], "3": [14]}' --parallel 2

  # Find an active milestone run
  code-graph checkpoint milestone find "M3: Code Graph"

  # Advance to the next wave
  code-graph checkpoint milestone set-wave abc-123 2

  # Mark an issue as completed
  code-graph checkpoint milestone complete-issue abc-123

  # Force-unblock a deadlocked issue
  code-graph checkpoint milestone add-force-resolved abc-123 99

  # Mark milestone as completed
  code-graph checkpoint milestone set-status abc-123 completed

=== WORKTREE EXAMPLES ===

  # Create worktree entry after git worktree creation
  code-graph checkpoint worktree create abc-123 145 "feat/issue-145" "/path/to/.worktrees/issue-145"

  # Find worktree by issue number
  code-graph checkpoint worktree find 145

  # Update worktree status to running
  code-graph checkpoint worktree update 145 running

  # Update status to pr-created and set PR number
  code-graph checkpoint worktree update 145 pr-created 42

  # Mark as merged
  code-graph checkpoint worktree update 145 merged

  # Remove worktree entry
  code-graph checkpoint worktree remove 145

  # List all worktrees
  code-graph checkpoint worktree list
`);
}
