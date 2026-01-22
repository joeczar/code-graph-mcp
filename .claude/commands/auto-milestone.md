# /auto-milestone $ARGUMENTS

Analyze and optionally execute a milestone's issues in dependency order.

## Quick Reference

```bash
/auto-milestone "M3: Code Graph"              # Analyze milestone
/auto-milestone "M3: Code Graph" --execute    # Analyze and execute
/auto-milestone 12 13 14                      # Specific issues
```

## Arguments

| Argument | Description |
|----------|-------------|
| Milestone name | Analyze all issues in the milestone |
| Issue numbers | Analyze specific issues (space-separated) |
| `--execute` | Actually run /auto-issue for each (default: analyze only) |
| `--parallel N` | Max concurrent issues (default: smart, see below) |
| `--continue` | Resume from interruption (reads state from checkpoint DB) |
| `--force-resolve N` | Force-unblock issue #N (treat blockers as resolved) |

### Smart Parallel Default

When `--parallel` is not specified, the planner recommends a value:

```
If largest wave has 1 issue → parallel = 1 (sequential)
If largest wave has 2+ issues → parallel = min(largest_wave_size, 2)
```

This balances speed with safety. Override with `--parallel N` if needed.

---

## State Tracking

The orchestrator uses the checkpoint system (`.claude/execution-state.db`) to track milestone progress at two levels:

1. **Milestone level** - Overall progress, current wave, parallel setting
2. **Issue level** - Individual workflow state for each issue

### Milestone Checkpoint Commands

```bash
# Check for existing milestone run
pnpm checkpoint milestone find "{milestone_name}"

# Create a new milestone run (with wave JSON from planner)
pnpm checkpoint milestone create "{milestone_name}" --waves '{"1": [12, 15], "2": [13]}' --parallel 2

# Advance to next wave
pnpm checkpoint milestone set-wave "{run_id}" {wave_number}

# Mark an issue as completed (increments counter)
pnpm checkpoint milestone complete-issue "{run_id}"

# Force-unblock an issue
pnpm checkpoint milestone add-force-resolved "{run_id}" {issue_number}

# Set status (running, paused, completed, failed, deadlocked)
pnpm checkpoint milestone set-status "{run_id}" {status}
```

### Issue Checkpoint Commands

```bash
# Check existing workflow for an issue
pnpm checkpoint workflow find {issue_number}

# Get full workflow state
pnpm checkpoint workflow get "{workflow_id}"

# Update phase after completing a step
pnpm checkpoint workflow set-phase "{workflow_id}" {phase}

# Track PR creation
pnpm checkpoint workflow set-pr "{workflow_id}" {pr_number}

# Track merge completion
pnpm checkpoint workflow set-merged "{workflow_id}" {merge_sha}
```

### Workflow Phases

| Phase | Meaning |
|-------|---------|
| `setup` | Branch created, issue assigned |
| `research` | Plan created |
| `implement` | Code written, commits made |
| `review` | Review agents run |
| `finalize` | PR created |
| `merge` | Merge in progress (/auto-merge running) |

### PR States

| State | Meaning |
|-------|---------|
| `open` | PR created, awaiting merge |
| `merged` | PR successfully merged |
| `closed` | PR closed without merging |

Each workflow tracks: issue number, branch, current phase, PR number, PR state, and all commits made.

See `.claude/shared/checkpoint-patterns.md` for detailed patterns.

## Workflow

```
Phase 0: Init     → check for existing run, resume or create new
Phase 1: Plan     → milestone-planner → GATE (if dependencies unclear)
Phase 2: Execute  → spawn /auto-issue for each free issue
Phase 3: Monitor  → track progress, handle completion, deadlock detection
Phase 4: Report   → summary of results
```

---

## Phase 0: Initialize

**Before planning, check for existing milestone run:**

```bash
# Check for existing run
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

**If resuming:**
- Skip to Phase 2 with `current_wave` from checkpoint
- Issues in completed waves are skipped automatically

**If not resuming (or no existing run):**
- Proceed to Phase 1 (Plan)
- Create milestone run after planning is complete

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
7. Analyze for deadlocks (if no free issues)
8. Recommend parallel setting

**After planning completes (if --execute):**

```bash
# Create milestone run checkpoint
pnpm checkpoint milestone create "{milestone_name}" --waves '{wave_json}' --parallel {parallel}
```

### Output

```markdown
## Milestone: M3: Code Graph

**Progress:** 0/16 (0%)
**Planning Status:** ready

### Execution Waves

| Wave | Issues | Description |
|------|--------|-------------|
| 1 | #12 | AST walker base class |
| 2 | #13, #15 | TS/Ruby entity extraction |
| 3 | #14, #16 | TS/Ruby relationship extraction |
| ... | ... | ... |

### Free Issues (can start now)
- #12: AST walker base class with node visitor pattern
```

---

## Phase 2: Execute (if --execute)

**GATE: Confirm before execution**

```
Ready to execute milestone "M3: Code Graph"

Will process 16 issues in 6 waves:
- Wave 1: #12
- Wave 2: #13, #15
- ...

Proceed? [y/N]
```

### Wave Execution Pattern

Each wave must be fully merged before starting the next wave. This prevents rebase conflicts when dependent issues build on earlier work.

```
WRONG (causes conflicts):
  Wave 1: /auto-issue #12 → PR #30 created
  Wave 2: /auto-issue #13 → PR #31 created (base: main without #12!)
  Later: merge all → CONFLICTS

CORRECT:
  Wave 1: /auto-issue #12 → PR #30 created → /auto-merge #30 → MERGED
  Wave 2: /auto-issue #13 → PR #31 created (base: main WITH #12) → /auto-merge #31 → MERGED
```

---

### Sequential Execution (parallel=1)

When `--parallel 1` is set, process ONE issue at a time through the COMPLETE cycle before starting the next:

```
For each issue in wave order:
  1. Check: pnpm checkpoint workflow find {issue}
     - If pr_state=merged → skip issue (already done)
     - If pr_state=open → skip to step 4 (/auto-merge)
     - Otherwise continue to step 2
  2. /auto-issue {issue} → creates PR, sets phase=finalize, pr_state=open
  3. Get PR number from workflow: pnpm checkpoint workflow find {issue}
  4. /auto-merge {pr_number} → merges PR, sets pr_state=merged
  5. Verify: pnpm checkpoint workflow find {issue} shows pr_state=merged
  6. git checkout main && git pull
  7. Move to next issue
```

Do not create multiple PRs before merging. Each PR must be merged before starting the next issue. This ensures:
- Each new branch starts from up-to-date main
- No parallel rebase conflicts
- Clean linear history
- Full checkpoint trail for resume

---

### For Each Wave:

#### Step 1: Create PRs

For each issue in the wave, spawn `/auto-issue`:

```
Task(auto-issue):
  Input:  { issue_number }
  Output: { status, pr_number, error? }
```

Issues within a wave can run in parallel (they don't depend on each other).

#### Step 2: Merge PRs

**After ALL issues in the wave have PRs created**, merge them sequentially:

```
For each PR created in this wave:
  /auto-merge {pr_number}
```

Sequential merge ensures:
- Each merge lands cleanly on updated main
- CI runs on final integrated state
- No parallel merge race conditions

#### Step 3: Verify and Continue

After all PRs in the wave are merged:
1. Pull latest main: `git pull origin main`
2. Update milestone checkpoint:
   ```bash
   # Mark issues complete and advance wave
   pnpm checkpoint milestone complete-issue "{run_id}"  # For each merged issue
   pnpm checkpoint milestone set-wave "{run_id}" {next_wave}
   ```
3. Check which blocked issues are now free
4. Proceed to next wave

**Only start the next wave after ALL PRs from current wave are merged.**

---

## Phase 3: Monitor

### Wave Checkpoint Updates

After each issue completes:
```bash
pnpm checkpoint milestone complete-issue "{run_id}"
```

After each wave completes:
```bash
pnpm checkpoint milestone set-wave "{run_id}" {next_wave}
```

### Deadlock Handling

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

**When force-resolving:**
```bash
# Record force resolution
pnpm checkpoint milestone add-force-resolved "{run_id}" {issue_number}
# Continue processing
```

**When pausing:**
```bash
pnpm checkpoint milestone set-status "{run_id}" deadlocked
```

### Progress Tracking

Track progress in real-time:

```markdown
## Progress: M3: Code Graph

Milestone Run: {run_id}
Progress: {completed_issues}/{total_issues}

Wave 1: ✅ Complete
- #12: ✅ PR #30 merged

Wave 2: 🔄 In Progress
- #13: 🔄 PR #31 (CI running)
- #15: ✅ PR #32 merged

Wave 3: ⏳ Waiting
- #14: Blocked by #13
- #16: Blocked by #15 ✅
```

---

## Phase 4: Report

**Mark milestone as complete:**
```bash
pnpm checkpoint milestone set-status "{run_id}" completed
```

Final summary:

```markdown
## Milestone Complete: M3: Code Graph

**Duration:** 2h 15m
**Issues:** 16/16 complete
**PRs Created:** 16
**PRs Merged:** 16

### Results by Wave

| Wave | Issues | Status |
|------|--------|--------|
| 1 | #12 | ✅ Merged |
| 2 | #13, #15 | ✅ Merged |
| ... | ... | ... |

### Issues
- #12: ✅ PR #30
- #13: ✅ PR #31
- ...
```

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Milestone not found | Show available milestones, exit |
| Issue not found | Skip issue, log warning, continue |
| Circular dependency | Report cycle, set status=deadlocked, ask for resolution |
| /auto-issue failure | Mark workflow as failed, offer retry/skip options |
| External blocker (closed) | Auto-resolve, continue |
| External blocker (open) | Add to deadlock analysis |
| All issues blocked | Trigger deadlock handling flow |

**On failure, always update checkpoint:**
```bash
pnpm checkpoint workflow set-status "{workflow_id}" failed
pnpm checkpoint workflow log-action "{workflow_id}" "error" failed "{error_message}"
```

---

## Resume Handling (--continue)

When `--continue` is passed:

### Step 1: Query Milestone Checkpoint

```bash
# Find existing milestone run
pnpm checkpoint milestone find "{milestone_name}"
```

**If milestone run found:**
- Use `current_wave` to know where to resume
- Use `wave_issues` to get issue list per wave
- Use `completed_issues` to show progress
- Use `force_resolved` to know which blockers were manually resolved

### Step 2: Query Issue States

For each issue starting from `current_wave`:

```bash
pnpm checkpoint workflow find {issue_number}
```

### Step 3: Determine Resume Point

| Milestone State | Issue Workflow State | Resume Action |
|-----------------|---------------------|---------------|
| Wave N | No workflow found | Run /auto-issue (fresh start) |
| Wave N | phase in (setup, research, implement, review) | Run /auto-issue (will detect existing branch) |
| Wave N | phase = finalize, pr_state = open | Run /auto-merge {pr_number} |
| Wave N | phase = merge, pr_state = open | Run /auto-merge {pr_number} (retry) |
| Wave N | pr_state = merged | Skip issue (already complete) |
| Wave N | status = failed | Report failure, ask whether to retry or skip |
| Wave < N | Any | Skip wave (already complete) |

### Step 4: Resume Execution

```bash
# 1. Get milestone run state
pnpm checkpoint milestone find "{milestone_name}"
# → current_wave: 2, wave_issues: {"1": [12], "2": [13, 15], "3": [14]}

# 2. Ensure clean state
git checkout main && git pull

# 3. Skip waves 1..current_wave-1 (already done)
# 4. For current wave, check each issue:
pnpm checkpoint workflow find 13  → pr_state: open, PR #105 → /auto-merge 105
pnpm checkpoint workflow find 15  → pr_state: merged       → SKIP

# 5. Continue from current_wave forward
```

### Example Resume Flow

```bash
# Milestone run state
pnpm checkpoint milestone find "M3: Code Graph"
# → { current_wave: 2, completed_issues: 3, total_issues: 6 }

# Issues in wave 2
wave_issues["2"] = [13, 15]

# Query each issue's workflow
pnpm checkpoint workflow find 13  → pr_state: open, PR #105 → /auto-merge 105
pnpm checkpoint workflow find 15  → pr_state: merged       → SKIP

# After wave 2 completes:
pnpm checkpoint milestone set-wave "{run_id}" 3

# Continue to wave 3...
```

---

## Example Usage

### Analyze Only (default)

```bash
/auto-milestone "M2: MCP Server Foundation"
```

Shows dependency analysis without executing anything.

### Execute Milestone

```bash
/auto-milestone "M2: MCP Server Foundation" --execute
```

Analyzes, confirms, then executes each issue via /auto-issue.

### Specific Issues

```bash
/auto-milestone 5 6 7 8 --execute
```

Process only issues #5, #6, #7, #8 in dependency order.
