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

function getDb() {
  const envPath = process.env['CHECKPOINT_DB_PATH'];
  return getCheckpointDb(envPath ?? DEFAULT_DB_PATH);
}

export async function runCheckpointCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help') {
    printCheckpointHelp();
    return;
  }

  if (subcommand !== 'workflow') {
    console.error(`Unknown checkpoint subcommand: ${subcommand}`);
    console.error('Use: checkpoint workflow <action>');
    process.exit(1);
  }

  const action = args[1];
  if (!action) {
    console.error('Usage: checkpoint workflow <action>');
    printCheckpointHelp();
    process.exit(1);
  }
  const actionArgs = args.slice(2);

  try {
    await handleWorkflowAction(action, actionArgs);
  } finally {
    closeCheckpointDb();
  }
}

async function handleWorkflowAction(action: string, args: string[]): Promise<void> {
  const db = getDb();

  switch (action) {
    case 'create': {
      const [issueNumberStr, branchName] = args;
      if (!issueNumberStr || !branchName) {
        console.error('Usage: checkpoint workflow create <issue_number> <branch_name>');
        process.exit(1);
      }
      const issueNumber = parseInt(issueNumberStr, 10);
      if (isNaN(issueNumber)) {
        console.error('issue_number must be a number');
        process.exit(1);
      }

      // Check if workflow already exists
      const existing = findWorkflowByIssue(db, issueNumber);
      if (existing) {
        console.error(`Workflow already exists for issue #${issueNumber}`);
        console.log(JSON.stringify(existing, null, 2));
        process.exit(1);
      }

      const workflow = createWorkflow(db, { issue_number: issueNumber, branch_name: branchName });
      console.log(JSON.stringify(workflow, null, 2));
      break;
    }

    case 'find': {
      const [issueNumberStr] = args;
      if (!issueNumberStr) {
        console.error('Usage: checkpoint workflow find <issue_number>');
        process.exit(1);
      }
      const issueNumber = parseInt(issueNumberStr, 10);
      if (isNaN(issueNumber)) {
        console.error('issue_number must be a number');
        process.exit(1);
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
        console.error('Usage: checkpoint workflow get <workflow_id>');
        process.exit(1);
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
        console.error('Usage: checkpoint workflow set-phase <workflow_id> <phase>');
        console.error('Phases: setup, research, implement, review, finalize');
        process.exit(1);
      }

      const validPhases: WorkflowPhase[] = ['setup', 'research', 'implement', 'review', 'finalize'];
      if (!validPhases.includes(phase as WorkflowPhase)) {
        console.error(`Invalid phase: ${phase}`);
        console.error(`Valid phases: ${validPhases.join(', ')}`);
        process.exit(1);
      }

      const success = setWorkflowPhase(db, workflowId, phase as WorkflowPhase);
      if (success) {
        const workflow = getWorkflow(db, workflowId);
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        console.error(`Workflow not found: ${workflowId}`);
        process.exit(1);
      }
      break;
    }

    case 'set-status': {
      const [workflowId, status] = args;
      if (!workflowId || !status) {
        console.error('Usage: checkpoint workflow set-status <workflow_id> <status>');
        console.error('Statuses: running, paused, completed, failed');
        process.exit(1);
      }

      const validStatuses: WorkflowStatus[] = ['running', 'paused', 'completed', 'failed'];
      if (!validStatuses.includes(status as WorkflowStatus)) {
        console.error(`Invalid status: ${status}`);
        console.error(`Valid statuses: ${validStatuses.join(', ')}`);
        process.exit(1);
      }

      const success = setWorkflowStatus(db, workflowId, status as WorkflowStatus);
      if (success) {
        const workflow = getWorkflow(db, workflowId);
        console.log(JSON.stringify(workflow, null, 2));
      } else {
        console.error(`Workflow not found: ${workflowId}`);
        process.exit(1);
      }
      break;
    }

    case 'log-action': {
      const [workflowId, actionType, status, ...detailsParts] = args;
      if (!workflowId || !actionType || !status) {
        console.error('Usage: checkpoint workflow log-action <workflow_id> <action_type> <status> [details]');
        console.error('Status: success, failed, skipped');
        process.exit(1);
      }

      const validStatuses = ['success', 'failed', 'skipped'];
      if (!validStatuses.includes(status)) {
        console.error(`Invalid status: ${status}`);
        console.error(`Valid statuses: ${validStatuses.join(', ')}`);
        process.exit(1);
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
        console.error('Usage: checkpoint workflow log-commit <workflow_id> <sha> <message>');
        process.exit(1);
      }

      const message = messageParts.join(' ');
      const commit = logCommit(db, workflowId, sha, message);
      console.log(JSON.stringify(commit, null, 2));
      break;
    }

    case 'delete': {
      const [workflowId] = args;
      if (!workflowId) {
        console.error('Usage: checkpoint workflow delete <workflow_id>');
        process.exit(1);
      }

      const success = deleteWorkflow(db, workflowId);
      if (success) {
        console.log(`Deleted workflow: ${workflowId}`);
      } else {
        console.error(`Workflow not found: ${workflowId}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown workflow action: ${action}`);
      printCheckpointHelp();
      process.exit(1);
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
