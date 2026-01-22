# Worktree Manager

Manage git worktrees for parallel Claude Code sessions.

## Usage

Run the worktree manager script with the provided arguments:

```bash
"$CLAUDE_PROJECT_DIR/scripts/worktree-manager.sh" $ARGUMENTS
```

## Available Commands

### Worktree Operations

- `create <issue> [branch]` - Create a new worktree for a GitHub issue
- `remove <issue>` - Remove a worktree and optionally its branch
- `list` - List all worktrees
- `status` - Show detailed status of all worktrees
- `update-status <issue> <status> [pr]` - Update worktree status
- `path <issue>` - Print the path to a worktree
- `rebase <issue>` - Rebase a worktree on main
- `sync` - Sync state file with actual git worktrees
- `cleanup-all [--force] [--dry-run]` - Remove all worktrees

### CI Operations

- `ci-status <pr> [--wait]` - Check CI status for a PR (--wait blocks until complete)

### Utility

- `state-json` - Output full state as JSON
- `help` - Show help

## Status Values

| Status | Meaning |
|--------|---------|
| `created` | Worktree just created |
| `running` | Work in progress |
| `pr-created` | PR has been created |
| `merged` | PR merged successfully |
| `failed` | Encountered errors |

## Examples

```bash
# Create a worktree for issue #164
/worktree create 164

# Create with custom branch name
/worktree create 164 feat/sqlite-api-key

# Check status of all worktrees
/worktree status

# Update status after PR creation
/worktree update-status 164 pr-created 145

# Wait for CI to complete
/worktree ci-status 145 --wait

# Remove a worktree
/worktree remove 164

# Clean up all worktrees
/worktree cleanup-all --force
```

## Workflow

### Manual Parallel Development

1. Create worktrees for issues you want to work on in parallel
2. Open a new terminal for each worktree
3. Run `claude` in each worktree directory
4. Each Claude session works independently on its issue
5. Use `/worktree status` in any session to see all active work

### With auto-milestone

When using `/auto-milestone --parallel N`:

1. Worktrees are created automatically for each issue in a wave
2. /auto-issue runs in each worktree directory
3. PRs are created in parallel
4. PRs are merged sequentially after CI passes
5. Worktrees are cleaned up after merging

## State Management

State is stored in two places:

1. **`.worktrees/.state.json`** - Worktree-level state (issue, branch, status, PR)
2. **`.claude/execution-state.db`** - Full workflow state via `pnpm checkpoint`

The JSON state file is lightweight and used for quick status checks. The checkpoint database stores full workflow history.
