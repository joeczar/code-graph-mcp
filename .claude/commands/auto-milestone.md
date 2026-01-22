# /auto-milestone $ARGUMENTS

Analyze and optionally execute a milestone's issues in dependency order with parallel worktree support.

## Quick Reference

```bash
/auto-milestone "M3: Code Graph"              # Analyze milestone
/auto-milestone "M3: Code Graph" --execute    # Analyze and execute
/auto-milestone "M3: Code Graph" --execute --parallel 2  # Parallel execution
/auto-milestone 12 13 14                      # Specific issues
```

## Arguments

| Argument | Description |
|----------|-------------|
| Milestone name | Analyze all issues in the milestone |
| Issue numbers | Analyze specific issues (space-separated) |
| `--execute` | Actually run /auto-issue for each (default: analyze only) |
| `--parallel N` | Max concurrent issues per wave (default: 1 = sequential) |
| `--continue` | Resume from interruption (reads state from checkpoint DB) |
| `--force-resolve N` | Force-unblock issue #N (treat blockers as resolved) |

### Parallel Execution Modes

| Mode | `--parallel` | Behavior |
|------|-------------|----------|
| Sequential | 1 (default) | One issue at a time, no worktrees |
| Parallel | 2+ | Uses git worktrees for isolation |

---

## State Tracking

The orchestrator uses two state systems:

1. **Milestone/Workflow state** - `.claude/execution-state.db` via `pnpm checkpoint`
2. **Worktree state** - `.worktrees/.state.json` for parallel tracking

### Checkpoint Commands

```bash
# Milestone state
pnpm checkpoint milestone find "{milestone_name}"
pnpm checkpoint milestone create "{milestone_name}" --waves '{"1": [12, 15], "2": [13]}' --parallel 2
pnpm checkpoint milestone set-wave "{run_id}" {wave_number}
pnpm checkpoint milestone complete-issue "{run_id}"
pnpm checkpoint milestone set-status "{run_id}" {status}

# Workflow state (per issue)
pnpm checkpoint workflow find {issue_number}
pnpm checkpoint workflow get "{workflow_id}"
pnpm checkpoint workflow set-phase "{workflow_id}" {phase}
pnpm checkpoint workflow set-pr "{workflow_id}" {pr_number}
```

### Worktree Commands

```bash
# Create/manage worktrees
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" create {issue}
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" update-status {issue} {status} [pr]
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" ci-status {pr} --wait
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" remove {issue}
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" cleanup-all --force
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" status
```

---

## Workflow Overview

```
Phase 0: Init     → Check for existing run, resume or create new
Phase 1: Plan     → milestone-planner → GATE (if dependencies unclear)
Phase 2: Execute  → Create PRs (parallel or sequential based on --parallel)
Phase 3: Review   → Wait for CI, handle review feedback
Phase 4: Merge    → Merge PRs sequentially (respects dependency order)
Phase 5: Cleanup  → Remove worktrees, generate summary
```

---

## Phase 0: Initialize

**Check for existing milestone run:**

```bash
pnpm checkpoint milestone find "{milestone_name}"
```

**If run exists with status=running/paused:**

```
Found existing milestone run:
- ID: {run_id}
- Current wave: {current_wave}/{total_waves}
- Completed: {completed_issues}/{total_issues}
- Status: {status}

Resume from wave {current_wave}? [y/N]
```

**Resume logic:**

| Current State | Resume Action |
|---------------|---------------|
| Phase: planning | Re-run milestone-planner |
| Phase: execute | Continue with remaining issues in wave |
| Phase: review | Continue CI waiting / review handling |
| Phase: merge | Continue merging from next unmerged PR |
| Phase: cleanup | Re-run cleanup |

---

## Phase 1: Plan

**Agent:** `milestone-planner`

```
Task(milestone-planner):
  Input:  { mode: "milestone" | "issues", milestone_name | issue_numbers }
  Output: { planning_status, free_issues[], dependency_graph, execution_waves[], recommended_parallel, wave_json }
```

The milestone-planner will:

1. Fetch all issues in milestone (or specified issues)
2. Parse dependency markers from issue bodies
3. Build dependency graph
4. Classify external dependencies (auto-resolve closed ones)
5. Identify free (unblocked) issues
6. Calculate execution waves
7. Analyze for deadlocks
8. Recommend parallel setting

**After planning completes (if --execute):**

```bash
pnpm checkpoint milestone create "{milestone_name}" --waves '{wave_json}' --parallel {parallel}
```

### Planning Output

```markdown
## Milestone: M3: Code Graph

**Progress:** 0/16 (0%)
**Planning Status:** ready
**Recommended Parallel:** 2 (largest wave has 3 issues)

### Execution Waves

| Wave | Issues | Can Parallelize |
|------|--------|-----------------|
| 1 | #12, #15 | Yes (2 independent) |
| 2 | #13, #16 | Yes (after wave 1) |
| 3 | #14, #17 | Yes (after wave 2) |

### Wave JSON (for checkpoint)

\`\`\`json
{"1": [12, 15], "2": [13, 16], "3": [14, 17]}
\`\`\`
```

---

## Phase 2: Execute

**GATE: Confirm before execution**

```
Ready to execute milestone "M3: Code Graph"

Will process 16 issues in 6 waves:
- Wave 1: #12, #15
- Wave 2: #13, #16
- ...

Parallel mode: {parallel} (using worktrees)

Proceed? [y/N]
```

### Sequential Mode (parallel=1)

When `--parallel 1` (default), process ONE issue at a time through the COMPLETE cycle:

```
For each issue in wave order:
  1. Check: pnpm checkpoint workflow find {issue}
     - If pr_state=merged → skip (already done)
     - If pr_state=open → skip to merge phase
     - Otherwise continue
  2. /auto-issue {issue} → creates PR
  3. Get PR: pnpm checkpoint workflow find {issue}
  4. /auto-merge {pr_number} → merges PR
  5. Verify merged
  6. git checkout main && git pull
  7. Move to next issue
```

No worktrees needed. Each PR is merged before starting the next.

---

### Parallel Mode (parallel>=2)

When `--parallel N` (N >= 2), use worktrees for isolation:

#### Step 1: Create Worktrees and Spawn Agents

For each issue in current wave (up to parallel limit):

```bash
# Create worktree
worktree_path=$("$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" create {issue})

# Update status
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" update-status {issue} running
```

Spawn parallel `/auto-issue` subagents via Task tool:

```
Task(auto-issue workflow):
  Input:  { issue_number, worktree_path }
  Output: { issue, status, pr_number, branch, error? }
```

**IMPORTANT:** Spawn up to `parallel` agents simultaneously. Do not wait for one to complete before starting the next within a wave.

#### Step 2: Collect Results

After ALL subagents in the wave complete, collect results:

```bash
# Get worktree state
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" state-json
```

Each completed auto-issue should have updated:
- Worktree status to `pr-created`
- PR number in state

---

## Phase 3: Review

**After all issues in wave have PRs:**

### CI Waiting

For each PR created in the wave:

```bash
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" ci-status {pr} --wait
```

This waits with exponential backoff until CI completes.

### Review Handling

If CI fails or review issues found:

1. **Classify findings** using same rules as /auto-issue
2. **Dispatch fix subagents** for critical findings (confidence >= 60%)
3. **Re-poll CI** after fixes (max 3 retries per PR)
4. **Skip if unresolvable** - mark issue as failed, continue with others

### Wave Completion Check

All PRs in wave must pass CI before proceeding to merge phase.

---

## Phase 4: Merge

**Using dependency graph from Phase 1, merge PRs in order:**

### Merge Order

For parallel waves, merge in dependency order:
1. Issues that nothing depends on → merge first
2. Then issues that depend on merged issues
3. Continue until all merged

### Merge Process

For each PR:

```bash
# Pre-merge validation
pnpm test && pnpm typecheck && pnpm lint

# Merge PR
gh pr merge {pr} --squash --delete-branch

# Update state
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" update-status {issue} merged

# Pull latest
git checkout main && git pull origin main
```

### Conflict Handling

After each merge, remaining PRs may need rebasing:

```bash
# For each remaining worktree
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" rebase {issue}

# If rebase fails, mark as needing attention
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" update-status {issue} conflict
```

### Wave Completion

After all PRs in wave are merged:

```bash
# Update milestone checkpoint
pnpm checkpoint milestone set-wave "{run_id}" {next_wave}

# Process next wave
```

---

## Phase 5: Cleanup

### Remove Worktrees

```bash
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" cleanup-all --force
```

### Mark Complete

```bash
pnpm checkpoint milestone set-status "{run_id}" completed
```

### Generate Summary

```markdown
## Milestone Complete: M3: Code Graph

**Duration:** 2h 15m
**Issues:** 16/16 complete
**PRs Created:** 16
**PRs Merged:** 16

### Results by Wave

| Wave | Issues | Status |
|------|--------|--------|
| 1 | #12, #15 | ✅ Merged |
| 2 | #13, #16 | ✅ Merged |
| ... | ... | ... |

### Issues Summary

- #12: ✅ PR #30 merged
- #13: ✅ PR #31 merged
- ...
```

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Milestone not found | Show available milestones, exit |
| Issue not found | Skip issue, log warning, continue |
| Circular dependency | Report cycle, set status=deadlocked |
| /auto-issue failure | Mark workflow failed, offer retry/skip |
| CI failure | Attempt fixes (3x), then mark failed |
| Merge conflict | Attempt rebase, mark conflict if fails |
| External blocker (closed) | Auto-resolve, continue |
| External blocker (open) | Add to deadlock analysis |

---

## Deadlock Handling

If a wave has no processable issues (all blocked):

```
⚠️ DEADLOCK DETECTED

All issues in wave {wave} are blocked:
- #13: blocked by #99 (external-open, M4: Future)
- #14: blocked by #12 (failed workflow)

Resolution Options:
[1] Force-resolve #13 (treat #99 as complete)
[2] Force-resolve #14 (treat #12 as complete)
[3] Retry failed workflow for #12
[4] Skip blocked issues and continue
[5] Pause milestone (status=deadlocked)
[6] Exit and resolve manually

Select option [1-6]:
```

---

## Resume Handling (--continue)

### Query State

```bash
# Find milestone run
pnpm checkpoint milestone find "{milestone_name}"
# → { current_wave, wave_issues, completed_issues, force_resolved, status }

# For each issue in current_wave:
pnpm checkpoint workflow find {issue_number}
# → { phase, pr_state, pr_number }
```

### Resume Decision Table

| Milestone Phase | Issue State | Resume Action |
|-----------------|-------------|---------------|
| execute | No workflow | Run /auto-issue (fresh) |
| execute | phase < finalize | Run /auto-issue (will resume) |
| execute | phase = finalize, pr_state = open | Skip to review |
| review | pr_state = open | Continue CI waiting |
| merge | pr_state = open | Run /auto-merge |
| merge | pr_state = merged | Skip (already done) |
| cleanup | any | Re-run cleanup |

### Resume Flow

```bash
# 1. Get milestone state
pnpm checkpoint milestone find "M3: Code Graph"

# 2. Sync worktree state
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" sync

# 3. Determine resume point per issue
# 4. Continue execution from that point
```

---

## Example Usage

### Analyze Only (default)

```bash
/auto-milestone "M2: MCP Server Foundation"
```

Shows dependency analysis without executing anything.

### Sequential Execution

```bash
/auto-milestone "M2: MCP Server Foundation" --execute
```

Processes issues one at a time, no worktrees.

### Parallel Execution

```bash
/auto-milestone "M2: MCP Server Foundation" --execute --parallel 2
```

Processes up to 2 issues simultaneously using worktrees.

### Specific Issues

```bash
/auto-milestone 5 6 7 8 --execute --parallel 2
```

Process only issues #5, #6, #7, #8 with parallelism.

### Resume

```bash
/auto-milestone "M2: MCP Server Foundation" --continue
```

Resume from last saved state.
