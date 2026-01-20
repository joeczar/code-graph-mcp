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
