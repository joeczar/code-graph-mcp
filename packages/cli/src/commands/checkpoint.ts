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
  deleteWorkflow,
  logAction,
  logCommit,
  getWorkflowSummary,
  type WorkflowPhase,
  type WorkflowStatus,
} from '@code-graph/core/checkpoint';

// Default database path - in .claude directory (gitignored)
const DEFAULT_DB_PATH = join(process.cwd(), '.claude', 'execution-state.db');

function getDb(): ReturnType<typeof getCheckpointDb> {
  const envPath = process.env['CHECKPOINT_DB_PATH'];
  return getCheckpointDb(envPath ?? DEFAULT_DB_PATH);
}

export function runCheckpointCommand(args: string[]): void {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    printCheckpointHelp();
    return;
  }

  if (subcommand !== 'workflow') {
    throw new Error(`Unknown checkpoint subcommand: ${subcommand}\nUse: checkpoint workflow <action>`);
  }

  const action = args[1];
  if (!action) {
    printCheckpointHelp();
    throw new Error('Usage: checkpoint workflow <action>');
  }
  const actionArgs = args.slice(2);

  try {
    handleWorkflowAction(action, actionArgs);
  } finally {
    closeCheckpointDb();
  }
}

function handleWorkflowAction(action: string, args: string[]): void {
  const db = getDb();

  switch (action) {
    case 'create': {
      const [issueNumberStr, branchName] = args;
      if (!issueNumberStr || !branchName) {
        throw new Error('Usage: checkpoint workflow create <issue_number> <branch_name>');
      }
      const issueNumber = parseInt(issueNumberStr, 10);
      if (isNaN(issueNumber)) {
        throw new Error('issue_number must be a number');
      }

      // Check if workflow already exists
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
      const [issueNumberStr] = args;
      if (!issueNumberStr) {
        throw new Error('Usage: checkpoint workflow find <issue_number>');
      }
      const issueNumber = parseInt(issueNumberStr, 10);
      if (isNaN(issueNumber)) {
        throw new Error('issue_number must be a number');
      }

      const workflow = findWorkflowByIssue(db, issueNumber);
      if (workflow) {
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        console.log('null');
      }
      break;
    }

    case 'get': {
      const [workflowId] = args;
      if (!workflowId) {
        throw new Error('Usage: checkpoint workflow get <workflow_id>');
      }

      const summary = getWorkflowSummary(db, workflowId);
      if (summary) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log('null');
      }
      break;
    }

    case 'list': {
      const statusArg = args.find((a) => a.startsWith('--status='));
      const statusValue = statusArg?.split('=')[1];
      const validStatuses: WorkflowStatus[] = ['running', 'paused', 'completed', 'failed'];
      const status = statusValue && validStatuses.includes(statusValue as WorkflowStatus)
        ? (statusValue as WorkflowStatus)
        : undefined;

      const limitArg = args.find((a) => a.startsWith('--limit='));
      const limitValue = limitArg?.split('=')[1];
      const limit = limitValue ? parseInt(limitValue, 10) : undefined;

      const options: { status?: WorkflowStatus; limit?: number } = {};
      if (status) options.status = status;
      if (limit) options.limit = limit;

      const workflows = listWorkflows(db, options);
      console.log(JSON.stringify(workflows, null, 2));
      break;
    }

    case 'set-phase': {
      const [workflowId, phase] = args;
      if (!workflowId || !phase) {
        throw new Error('Usage: checkpoint workflow set-phase <workflow_id> <phase>\nPhases: setup, research, implement, review, finalize');
      }

      const validPhases: WorkflowPhase[] = ['setup', 'research', 'implement', 'review', 'finalize'];
      if (!validPhases.includes(phase as WorkflowPhase)) {
        throw new Error(`Invalid phase: ${phase}\nValid phases: ${validPhases.join(', ')}`);
      }

      const success = setWorkflowPhase(db, workflowId, phase as WorkflowPhase);
      if (success) {
        const workflow = getWorkflow(db, workflowId);
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      break;
    }

    case 'set-status': {
      const [workflowId, status] = args;
      if (!workflowId || !status) {
        throw new Error('Usage: checkpoint workflow set-status <workflow_id> <status>\nStatuses: running, paused, completed, failed');
      }

      const validStatuses: WorkflowStatus[] = ['running', 'paused', 'completed', 'failed'];
      if (!validStatuses.includes(status as WorkflowStatus)) {
        throw new Error(`Invalid status: ${status}\nValid statuses: ${validStatuses.join(', ')}`);
      }

      const success = setWorkflowStatus(db, workflowId, status as WorkflowStatus);
      if (success) {
        const workflow = getWorkflow(db, workflowId);
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      break;
    }

    case 'log-action': {
      const [workflowId, actionType, status, ...detailsParts] = args;
      if (!workflowId || !actionType || !status) {
        throw new Error('Usage: checkpoint workflow log-action <workflow_id> <action_type> <status> [details]\nStatus: success, failed, skipped');
      }

      const validStatuses = ['success', 'failed', 'skipped'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}\nValid statuses: ${validStatuses.join(', ')}`);
      }

      const details = detailsParts.length > 0 ? detailsParts.join(' ') : undefined;
      const loggedAction = logAction(
        db,
        workflowId,
        actionType,
        status as 'success' | 'failed' | 'skipped',
        details
      );
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

      const success = deleteWorkflow(db, workflowId);
      if (success) {
        console.log(`Deleted workflow: ${workflowId}`);
      } else {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      break;
    }

    default:
      printCheckpointHelp();
      throw new Error(`Unknown workflow action: ${action}`);
  }
}

function printCheckpointHelp(): void {
  console.log(`
checkpoint - Manage workflow state

USAGE:
  code-graph checkpoint workflow <action> [args]

ACTIONS:
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
    Phases: setup, research, implement, review, finalize

  set-status <workflow_id> <status>
    Update workflow status.
    Statuses: running, paused, completed, failed

  log-action <workflow_id> <action_type> <status> [details]
    Log an action taken during the workflow.
    Status: success, failed, skipped

  log-commit <workflow_id> <sha> <message>
    Log a commit made during the workflow.

  delete <workflow_id>
    Delete a workflow and all its actions/commits.

EXAMPLES:
  # Start working on issue #12
  code-graph checkpoint workflow create 12 "feat/12-add-parser"

  # Check if issue already has a workflow
  code-graph checkpoint workflow find 12

  # Update phase after completing research
  code-graph checkpoint workflow set-phase abc-123 implement

  # Log a commit
  code-graph checkpoint workflow log-commit abc-123 a1b2c3d "feat(parser): add TS support"

  # Mark workflow complete
  code-graph checkpoint workflow set-status abc-123 completed
`);
}
