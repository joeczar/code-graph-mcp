# GitHub Master Agent

## Purpose

Centralized patterns for all GitHub operations. Other agents reference this for consistent git and gh CLI usage.

## Repository Info

- **Owner**: joeczar
- **Repo**: code-graph-mcp
- **Default Branch**: main

## Branch Naming

```
<type>/<issue-number>-<short-description>

Examples:
feat/12-typescript-parser
fix/45-concurrent-writes
test/23-blast-radius-edges
docs/8-readme-update
```

Types match conventional commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

## Issue Operations

### Fetch Issue Details

```bash
gh issue view <number> --json title,body,labels,assignees,milestone
```

### Assign Self to Issue

```bash
gh issue edit <number> --add-assignee @me
```

### Add Label

```bash
gh issue edit <number> --add-label "in-progress"
```

### Comment on Issue

```bash
gh issue comment <number> --body "Starting work on this issue"
```

## Branch Operations

### Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b <branch-name>
```

### Push Branch

```bash
git push -u origin <branch-name>
```

### Check Branch Status

```bash
git status
git log --oneline -5
```

## Commit Operations

### Stage and Commit

```bash
git add <files>
git commit -m "<type>(<scope>): <message>

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Amend Last Commit (use sparingly)

```bash
git commit --amend --no-edit
```

## PR Operations

### Create PR

```bash
gh pr create \
  --title "<type>(<scope>): <description>" \
  --body "## Summary

<bullet points>

## Changes

- <change 1>
- <change 2>

## Testing

- [ ] Tests pass: \`pnpm test\`
- [ ] Types pass: \`pnpm typecheck\`
- [ ] Lint passes: \`pnpm lint\`

Closes #<issue-number>" \
  --base main
```

### Link PR to Issue

```bash
# In PR body, use:
Closes #<number>
# or
Fixes #<number>
```

### Request Review

```bash
gh pr edit <number> --add-reviewer <username>
```

## Conflict Resolution

### Check for Conflicts

```bash
git fetch origin main
git diff origin/main...HEAD --stat
```

### Rebase on Main

```bash
git fetch origin main
git rebase origin/main
# Resolve conflicts if any
git push --force-with-lease
```

## Safety Rules

1. **Never force push to main**
2. **Always pull before creating branch**
3. **Use `--force-with-lease` not `--force`**
4. **Check status before committing**
5. **Verify tests pass before PR**

## Error Handling

### Uncommitted Changes

```bash
# Stash if needed
git stash
# Do operation
git stash pop
```

### Wrong Branch

```bash
# Check current branch
git branch --show-current
# Switch if wrong
git checkout <correct-branch>
```

### Failed Push

```bash
# Check if behind remote
git fetch origin
git status
# Rebase if needed
git rebase origin/<branch>
```
