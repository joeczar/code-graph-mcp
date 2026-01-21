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
| `--parallel N` | Max concurrent issues (default: 1) |
| `--continue` | Resume from interruption (reads state from checkpoint DB) |

---

## State Tracking

The orchestrator uses the checkpoint system (`.claude/execution-state.db`) to track milestone progress. Each issue gets its own workflow entry.

### Checkpoint Commands

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
Phase 1: Plan     → milestone-planner → GATE (if dependencies unclear)
Phase 2: Execute  → spawn /auto-issue for each free issue
Phase 3: Monitor  → track progress, handle completion
Phase 4: Report   → summary of results
```

---

## Phase 1: Plan

**Agent:** `milestone-planner`

```
Task(milestone-planner):
  Input:  { mode: "milestone" | "issues", milestone_name | issue_numbers }
  Output: { planning_status, free_issues[], dependency_graph, execution_waves[] }
```

The milestone-planner will:

1. Fetch all issues in milestone (or specified issues)
2. Parse dependency markers from issue bodies
3. Build dependency graph
4. Identify free (unblocked) issues
5. Return waves for execution

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
2. Check which blocked issues are now free
3. Proceed to next wave

**Only start the next wave after ALL PRs from current wave are merged.**

---

## Phase 3: Monitor

Track progress in real-time:

```markdown
## Progress: M3: Code Graph

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
| Issue not found | Skip issue, continue with others |
| Circular dependency | Report cycle, ask for resolution |
| /auto-issue failure | Log error, mark as failed, continue |
| All issues blocked | Report deadlock, exit |

---

## Resume Handling (--continue)

When `--continue` is passed:

### Step 1: Query Checkpoint State

For each issue in the milestone, check its workflow state:

```bash
pnpm checkpoint workflow find {issue_number}
```

### Step 2: Determine Resume Point

| Workflow State | Resume Action |
|----------------|---------------|
| No workflow found | Run /auto-issue (fresh start) |
| phase in (setup, research, implement, review) | Run /auto-issue (will detect existing branch) |
| phase = finalize, pr_state = open | Run /auto-merge {pr_number} |
| phase = merge, pr_state = open | Run /auto-merge {pr_number} (retry) |
| pr_state = merged | Skip issue (already complete) |
| status = failed | Report failure, ask whether to retry or skip |

### Step 3: Resume Execution

```bash
# 1. Ensure clean state
git checkout main && git pull

# 2. For each issue, check checkpoint
pnpm checkpoint workflow find {issue}

# 3. Based on state, either:
#    - Skip (already merged)
#    - Run /auto-merge (PR exists)
#    - Run /auto-issue (no PR yet)
```

### Example Resume Flow

```bash
# Query each issue's workflow
pnpm checkpoint workflow find 90  → pr_state: merged    → SKIP
pnpm checkpoint workflow find 92  → pr_state: open, PR #105 → /auto-merge 105
pnpm checkpoint workflow find 93  → no workflow         → /auto-issue 93

# Resume executes:
/auto-merge 105        → merges, sets pr_state=merged
/auto-issue 93         → creates PR #106, sets phase=finalize
/auto-merge 106        → merges, sets pr_state=merged
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
