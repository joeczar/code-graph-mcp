import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getCheckpointDb,
  closeCheckpointDb,
  createWorkflow,
  deleteWorkflow,
  createWorktree,
  getWorktree,
  findWorktreeByIssue,
  listWorktrees,
  setWorktreeStatus,
  deleteWorktree,
} from '../db.js';

describe('Worktree Operations', () => {
  const testDbPath = join(process.cwd(), '.test-checkpoint-worktree.db');

  beforeEach(() => {
    // Clean up any existing test database
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
      if (existsSync(`${testDbPath}-shm`)) {
        unlinkSync(`${testDbPath}-shm`);
      }
      if (existsSync(`${testDbPath}-wal`)) {
        unlinkSync(`${testDbPath}-wal`);
      }
    } catch (e) {
      // Ignore errors
    }
  });

  afterEach(() => {
    closeCheckpointDb();
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
      if (existsSync(`${testDbPath}-shm`)) {
        unlinkSync(`${testDbPath}-shm`);
      }
      if (existsSync(`${testDbPath}-wal`)) {
        unlinkSync(`${testDbPath}-wal`);
      }
    } catch (e) {
      // Ignore errors
    }
  });

  it('should create a worktree linked to a workflow', () => {
    const db = getCheckpointDb(testDbPath);

    // Create a workflow first
    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    // Create a worktree
    const worktree = createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    expect(worktree.id).toBeDefined();
    expect(worktree.workflow_id).toBe(workflow.id);
    expect(worktree.issue_number).toBe(145);
    expect(worktree.branch_name).toBe('feat/issue-145');
    expect(worktree.worktree_path).toBe('/path/to/.worktrees/issue-145');
    expect(worktree.status).toBe('created');
    expect(worktree.pr_number).toBeNull();
  });

  it('should find worktree by issue number', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    const found = findWorktreeByIssue(db, 145);
    expect(found).not.toBeNull();
    expect(found?.issue_number).toBe(145);
  });

  it('should update worktree status', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    // Update status
    const updated = setWorktreeStatus(db, 145, 'running');
    expect(updated).toBe(true);

    const found = findWorktreeByIssue(db, 145);
    expect(found?.status).toBe('running');
  });

  it('should update worktree status with PR number', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    // Update status with PR number
    const updated = setWorktreeStatus(db, 145, 'pr-created', 42);
    expect(updated).toBe(true);

    const found = findWorktreeByIssue(db, 145);
    expect(found?.status).toBe('pr-created');
    expect(found?.pr_number).toBe(42);
  });

  it('should list worktrees', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow1 = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    const workflow2 = createWorkflow(db, {
      issue_number: 146,
      branch_name: 'feat/issue-146',
    });

    createWorktree(db, {
      workflow_id: workflow1.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow2.id,
      issue_number: 146,
      branch_name: 'feat/issue-146',
      worktree_path: '/path/to/.worktrees/issue-146',
    });

    const worktrees = listWorktrees(db);
    expect(worktrees).toHaveLength(2);
  });

  it('should filter worktrees by status', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow1 = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    const workflow2 = createWorkflow(db, {
      issue_number: 146,
      branch_name: 'feat/issue-146',
    });

    createWorktree(db, {
      workflow_id: workflow1.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow2.id,
      issue_number: 146,
      branch_name: 'feat/issue-146',
      worktree_path: '/path/to/.worktrees/issue-146',
    });

    setWorktreeStatus(db, 145, 'running');

    const running = listWorktrees(db, { status: 'running' });
    expect(running).toHaveLength(1);
    expect(running[0].issue_number).toBe(145);

    const created = listWorktrees(db, { status: 'created' });
    expect(created).toHaveLength(1);
    expect(created[0].issue_number).toBe(146);
  });

  it('should delete worktree', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    const deleted = deleteWorktree(db, 145);
    expect(deleted).toBe(true);

    const found = findWorktreeByIssue(db, 145);
    expect(found).toBeNull();
  });

  it('should enforce unique issue_number constraint', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    // Attempt to create duplicate
    expect(() => {
      createWorktree(db, {
        workflow_id: workflow.id,
        issue_number: 145,
        branch_name: 'feat/issue-145-duplicate',
        worktree_path: '/path/to/.worktrees/issue-145-duplicate',
      });
    }).toThrow();
  });

  it('should cascade delete worktree when workflow is deleted', () => {
    const db = getCheckpointDb(testDbPath);

    const workflow = createWorkflow(db, {
      issue_number: 145,
      branch_name: 'feat/issue-145',
    });

    createWorktree(db, {
      workflow_id: workflow.id,
      issue_number: 145,
      branch_name: 'feat/issue-145',
      worktree_path: '/path/to/.worktrees/issue-145',
    });

    // Delete the workflow
    deleteWorkflow(db, workflow.id);

    // Worktree should be deleted too
    const found = findWorktreeByIssue(db, 145);
    expect(found).toBeNull();
  });
});
