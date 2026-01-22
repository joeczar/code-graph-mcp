# Checkpoint Patterns

Patterns for logging workflow state to enable resume after context compaction.

## Core Principle

**Checkpoints are advisory, not blocking.** If a checkpoint command fails:
1. Log the error
2. Continue with the workflow
3. Resume capability may be limited, but work continues

## Command Pattern

All checkpoint commands follow this pattern:

```bash
pnpm checkpoint workflow <action> <args>
```

## Commit Logging Pattern

**CRITICAL: Always log commits in two separate bash commands.**

```bash
# Step 1: Get the SHA (separate command)
git rev-parse HEAD

# Step 2: Log to checkpoint (use literal SHA value)
pnpm checkpoint workflow log-commit "{workflow_id}" "{sha}" "{message}"
```

**Why separate commands?**
- If git command fails, we get a clear error
- Shell variables can cause escaping issues
- Ensures the SHA is actually captured before logging

**NEVER do this:**
```bash
# BAD: Combined command
SHA=$(git rev-parse HEAD) && pnpm checkpoint workflow log-commit ...

# BAD: Inline substitution
pnpm checkpoint workflow log-commit "$(git rev-parse HEAD)" ...
```

## Phase Transitions

**IMPORTANT: Set the phase at the START of each phase, not at the end.**

This ensures that if interrupted, `current_phase` reflects what we were working on,
allowing correct resume:

```bash
# At START of setup
pnpm checkpoint workflow set-phase "{workflow_id}" setup

# At START of research (first thing issue-researcher does)
pnpm checkpoint workflow set-phase "{workflow_id}" research

# At START of implementation (first thing atomic-developer does)
pnpm checkpoint workflow set-phase "{workflow_id}" implement

# At START of review
pnpm checkpoint workflow set-phase "{workflow_id}" review

# At START of finalization (first thing finalize-agent does)
pnpm checkpoint workflow set-phase "{workflow_id}" finalize

# At START of merge (first thing /auto-merge does)
pnpm checkpoint workflow set-phase "{workflow_id}" merge
```

**Phases:** setup → research → implement → review → finalize → merge

**Phase semantics:** `current_phase` means "the phase we are currently working on"
(or about to work on). This allows resume to correctly restart the interrupted phase.

## Standard Actions

Use these action types for consistency:

| Action Type | When to Log |
|------------|-------------|
| `workflow_started` | After workflow created |
| `dev_plan_created` | After plan approved |
| `implementation_complete` | After all commits made |
| `pr_created` | After PR successfully created |
| `pr_merged` | After PR successfully merged |
| `merge_conflict` | When merge blocked by conflicts |

Example:
```bash
pnpm checkpoint workflow log-action "{workflow_id}" "dev_plan_created" success
```

## PR Tracking

Track the lifecycle of PRs associated with workflows:

```bash
# After creating a PR (in finalize-agent)
pnpm checkpoint workflow set-pr "{workflow_id}" {pr_number}

# After PR is merged (in /auto-merge)
pnpm checkpoint workflow set-merged "{workflow_id}" {merge_sha}
```

**PR States:**
- `open` - PR created, awaiting merge
- `merged` - PR has been merged
- `closed` - PR was closed without merging

The `set-pr` command automatically sets state to `open`.
The `set-merged` command automatically sets state to `merged` and records the squash commit SHA.

**Querying PR status:**
```bash
# Get workflow to check pr_state
pnpm checkpoint workflow get "{workflow_id}"

# List workflows with open PRs
pnpm checkpoint workflow list --status=completed
# Then filter by pr_state in output
```

## Workflow Completion

Always mark workflows complete when PR is created:

```bash
pnpm checkpoint workflow set-status "{workflow_id}" completed
```

Status values:
- `running` - Work in progress (default)
- `paused` - Intentionally paused
- `completed` - PR created successfully
- `failed` - Workflow abandoned due to errors

## Resume Flow

When resuming work on an issue:

```bash
# 1. Check for existing workflow
pnpm checkpoint workflow find {issue_number}

# 2. If found, get full summary
pnpm checkpoint workflow get "{workflow_id}"

# 3. Show user the saved state and ask to resume or start fresh
```

## Error Handling

If checkpoint commands fail:

```
Checkpoint command failed: {error}
Continuing without checkpoint logging.
Resume capability may be limited.
```

Don't let checkpoint failures block the actual work.

---

## Milestone Run Patterns

Milestone runs track orchestration-level state for `/auto-milestone`:

### Creating a Milestone Run

After the milestone-planner produces wave JSON:

```bash
pnpm checkpoint milestone create "{milestone_name}" --waves '{"1": [12, 15], "2": [13]}' --parallel 2
```

This creates a run with:
- `current_wave = 1`
- `completed_issues = 0`
- `status = running`

### Wave Progression

**After each issue completes (PR merged):**
```bash
pnpm checkpoint milestone complete-issue "{run_id}"
```

**After all issues in a wave complete:**
```bash
pnpm checkpoint milestone set-wave "{run_id}" {next_wave}
```

**Important:** Always update the wave AFTER completing all issues in the current wave.

### Resuming a Milestone

When using `--continue`:

```bash
# 1. Find existing run
pnpm checkpoint milestone find "{milestone_name}"
# Returns: { id, current_wave, completed_issues, wave_issues, status }

# 2. Parse wave_issues JSON to get issues per wave
# 3. Skip waves before current_wave
# 4. Resume processing from current_wave
```

### Deadlock Handling

When blocked issues are force-resolved:

```bash
# Record the force resolution
pnpm checkpoint milestone add-force-resolved "{run_id}" {issue_number}
```

This allows resume to know which blockers were manually resolved.

### Status Values

| Status | Meaning |
|--------|---------|
| `running` | Active execution |
| `paused` | User paused (can resume) |
| `completed` | All issues merged |
| `failed` | Unrecoverable error |
| `deadlocked` | Blocked with no resolution |

### Completion

When all issues are merged:

```bash
pnpm checkpoint milestone set-status "{run_id}" completed
```

### Example: Full Milestone Flow

```bash
# 1. Create run after planning
pnpm checkpoint milestone create "M3: Code Graph" --waves '{"1": [12], "2": [13, 15], "3": [14]}' --parallel 1
# → { id: "abc-123", current_wave: 1, ... }

# 2. Process wave 1
# ... /auto-issue 12 → /auto-merge → merged
pnpm checkpoint milestone complete-issue "abc-123"
pnpm checkpoint milestone set-wave "abc-123" 2

# 3. Process wave 2
# ... /auto-issue 13 → /auto-merge → merged
pnpm checkpoint milestone complete-issue "abc-123"
# ... /auto-issue 15 → /auto-merge → merged
pnpm checkpoint milestone complete-issue "abc-123"
pnpm checkpoint milestone set-wave "abc-123" 3

# 4. Process wave 3
# ... /auto-issue 14 → /auto-merge → merged
pnpm checkpoint milestone complete-issue "abc-123"

# 5. Complete
pnpm checkpoint milestone set-status "abc-123" completed
```

### Example: Resume After Interruption

```bash
# Find where we left off
pnpm checkpoint milestone find "M3: Code Graph"
# → { current_wave: 2, completed_issues: 1, wave_issues: {"1": [12], "2": [13, 15], "3": [14]} }

# Wave 1 complete (skip)
# Wave 2 in progress - check each issue:
pnpm checkpoint workflow find 13  # → pr_state: merged (skip)
pnpm checkpoint workflow find 15  # → pr_state: open, pr_number: 105

# Resume: merge #15's PR
/auto-merge 105
pnpm checkpoint milestone complete-issue "abc-123"
pnpm checkpoint milestone set-wave "abc-123" 3

# Continue to wave 3...
```

### Example: Force-Resolve Deadlock

```bash
# Deadlock detected - issue #13 blocked by #99 (external, open)
pnpm checkpoint milestone add-force-resolved "abc-123" 99

# Now #13 can be processed (its blocker is in force_resolved list)
/auto-issue 13
```
