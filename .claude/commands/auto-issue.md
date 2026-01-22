# /auto-issue

Autonomous workflow for implementing a GitHub issue without gates. Use for trusted issues where human review is not needed between phases.

## Usage

```
/auto-issue <issue_number>
/auto-issue <issue_number> --worktree <path>
```

## Arguments

- `issue_number` (required): The GitHub issue number to work on
- `--worktree <path>` (optional): Path to a git worktree to work in (for parallel execution)

## When to Use

Use `/auto-issue` when:
- Issue is well-defined with clear acceptance criteria
- Low risk (won't break existing functionality)
- Small scope (single feature or bug fix)
- You trust the plan without review

Use `/work-on-issue` instead when:
- Issue is complex or ambiguous
- Significant architectural changes
- You want to review the plan before implementation
- First time working on this area of code

## Worktree Mode

When `--worktree <path>` is provided, the workflow operates in an isolated git worktree:

### Before Starting

```bash
# Change to worktree directory
cd <worktree_path>

# Verify we're in the right place
git rev-parse --show-toplevel  # Should match worktree_path
```

All subsequent operations (git, pnpm, file edits) happen within the worktree directory.

### Branch Handling

In worktree mode:
- The branch already exists (created by worktree-manager)
- Skip branch creation in setup-agent
- Just verify we're on the correct branch

### State Updates

After creating a PR, update worktree state:

```bash
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" update-status {issue_number} pr-created {pr_number}
```

### Output for Orchestrator

When running in worktree mode (spawned by /auto-milestone), return structured output:

```json
{
  "issue": <issue_number>,
  "status": "success" | "failed",
  "pr_number": <pr_number or null>,
  "branch": "<branch_name>",
  "error": "<error message if failed>"
}
```

## Agents Summary

| Phase | Agent | Purpose |
|-------|-------|---------|
| 1 | `setup-agent` | Branch, checkpoint, issue assignment |
| 2 | `issue-researcher` | Analyze issue, create implementation plan |
| 3 | `atomic-developer` | Incremental implementation with commits |
| 4 | (review tools) | Validation and code review |
| 5 | `finalize-agent` | Push branch, create PR, complete workflow |

## Workflow Overview

```
Setup → Research → Implement → Review → Finalize
  ↓        ↓          ↓          ↓         ↓
 AUTO     AUTO       AUTO       AUTO      DONE
```

**No gates**: Workflow proceeds automatically through all phases.

---

## Resume from Checkpoint

Before starting Phase 1, check for an existing workflow:

```bash
pnpm checkpoint workflow find {issue_number}
```

**If a running workflow exists:**

```
Existing workflow found for issue #{issue_number}:
- Workflow ID: {id}
- Current phase: {current_phase}
- Last updated: {updated_at}

Resuming from {current_phase} phase...
```

If resuming, jump to the saved phase with the existing `workflow_id`.

---

## Phase 1: Setup

**Agent:** `setup-agent`

Task(setup-agent):
  Input:  { issue_number: <N>, worktree_path?: <path> }
  Output: { workflow_id, branch, issue, resumed }

The setup-agent will:
- Fetch issue details from GitHub
- Create feature branch (or checkout existing)
- Create checkpoint workflow (or resume existing)
- Assign self to issue
- Add "in-progress" label

**In worktree mode:**
- Change to worktree directory first: `cd <worktree_path>`
- Branch already exists (created by worktree-manager)
- Skip branch creation, just verify we're on correct branch
- All git operations happen in worktree context

*Proceed immediately to Phase 2*

---

## Phase 2: Research

**Agent:** `issue-researcher`

Task(issue-researcher):
  Input:  { issue, branch, workflow_id }
  Output: { analysis, plan, context }

The issue-researcher will:
- Set checkpoint phase to "research"
- Analyze issue requirements
- Explore relevant codebase areas
- Identify dependencies and risks
- Create implementation plan
- Log plan creation to checkpoint

**Auto-proceed check:**
- If `plan.questions` is non-empty: STOP and ask for clarification
- Otherwise: Proceed immediately to Phase 3

---

## Phase 3: Implement

**Agent:** `atomic-developer`

Task(atomic-developer):
  Input:  { plan, branch, workflow_id }
  Output: { commits, validation, completed_steps }

The atomic-developer will:
- Set checkpoint phase to "implement"
- Execute plan step-by-step
- Write tests first (when applicable)
- Make atomic commits (one logical change each)
- Log each commit to checkpoint
- Validate after each step (tests, types, lint)
- Log implementation complete

*Proceed immediately to Phase 4*

---

## Phase 4: Review Agents (MANDATORY)

**CRITICAL:** This phase runs automated review agents. Do NOT skip.

### Step 1: Identify Changed Files

```bash
git diff origin/main --name-only | grep -E '\.(ts|tsx|js|jsx)$'
```

If no TypeScript/JavaScript files changed, skip to validation.

### Step 2: Run Review Agents (in sequence)

| Agent | Purpose | Status |
|-------|---------|--------|
| `code-simplifier:code-simplifier` | Simplify and clarify code | ☐ |
| `pr-review-toolkit:code-reviewer` | Check bugs, style, quality | ☐ |
| `pr-review-toolkit:silent-failure-hunter` | Find silent failures | ☐ |

For each agent:
1. Launch via Task tool
2. Apply fixes with confidence >= 60%
3. Mark agent as complete (☑)

### Step 3: Commit Review Fixes

If any changes:
```bash
git add -A
git commit -m "refactor: address review findings"
```

### Step 4: Final Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

**Auto-proceed check:**
- If any validation fails: STOP and report failures
- If review agents were skipped (for TS/JS changes): STOP and run them
- If all pass AND review complete: Proceed to Phase 5

---

## Phase 5: Finalize

**Agent:** `finalize-agent`

Task(finalize-agent):
  Input:  { issue, branch, workflow_id, commits, worktree_path? }
  Output: { pr, validation, board_updated }

The finalize-agent will:
- Set checkpoint phase to "finalize"
- Push branch to origin
- Create pull request linked to issue
- Log PR creation to checkpoint
- Mark workflow as completed
- Report PR URL

**In worktree mode (additional steps):**
- Update worktree state with PR number:
  ```bash
  "$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" update-status {issue_number} pr-created {pr_number}
  ```
- Return structured output for orchestrator (see Worktree Mode section)

---

## Complete

**Report to user:**

```
WORKFLOW COMPLETE

Issue: #{number} - {title}
Branch: {branch}
PR: {pr_url}

Commits:
{list of commits}

All validation passed. PR ready for review.
```

---

## Stop Conditions

The autonomous workflow will stop if:

1. **Questions in plan**: Issue-researcher found ambiguities
2. **Validation failures**: Tests, types, or lint failed
3. **Scope creep**: Implementation reveals unexpected complexity
4. **Errors**: Any phase encounters an error

When stopped:
```
AUTO-ISSUE PAUSED

Phase: {current_phase}
Reason: {reason}

{details about what went wrong}

Options:
1. Fix and resume: /auto-issue {issue_number}
2. Switch to gated: /work-on-issue {issue_number}
```

---

## Error Handling

### Issue Not Found

```
Error: Issue #<number> not found.

Please verify:
1. Issue number is correct
2. You have access to the repository
```

### Dirty Working Directory

```
Warning: Uncommitted changes detected.

Stashing changes and continuing...
```

Unlike `/work-on-issue`, this stashes automatically.

### Validation Failures

If tests/lint/types fail, workflow stops:
```
AUTO-ISSUE STOPPED

Validation failed:
- Types: FAIL (3 errors)
- Tests: PASS
- Lint: PASS

Fix the issues and run again:
/auto-issue {issue_number}
```

---

## Shared Patterns

This command uses:
- `.claude/shared/conventional-commits.md` - Commit format
- `.claude/shared/validation-commands.md` - Test/lint/build commands
- `.claude/shared/escalation-patterns.md` - When to ask for help
- `.claude/shared/checkpoint-patterns.md` - Checkpoint logging patterns
- `.claude/agents/github-master.md` - Git/GitHub operations
- `.claude/skills/checkpoint-workflow/SKILL.md` - Checkpoint CLI reference
