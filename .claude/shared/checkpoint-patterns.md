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

Update the phase when entering a new workflow stage:

```bash
# After setup complete
pnpm checkpoint workflow set-phase "{workflow_id}" setup

# After research complete
pnpm checkpoint workflow set-phase "{workflow_id}" research

# After implementation complete
pnpm checkpoint workflow set-phase "{workflow_id}" implement

# After review complete
pnpm checkpoint workflow set-phase "{workflow_id}" review

# After PR created
pnpm checkpoint workflow set-phase "{workflow_id}" finalize
```

## Standard Actions

Use these action types for consistency:

| Action Type | When to Log |
|------------|-------------|
| `workflow_started` | After workflow created |
| `dev_plan_created` | After plan approved |
| `implementation_complete` | After all commits made |
| `pr_created` | After PR successfully created |

Example:
```bash
pnpm checkpoint workflow log-action "{workflow_id}" "dev_plan_created" success
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
