---
name: auto-merge
description: Merge an existing PR after rebasing, running review-pass, ensuring CI passes, and addressing review comments.
allowed-tools: Bash, Read, Task, Glob, Grep, Edit, Write, TodoWrite
---

# Auto-Merge Skill

## Purpose

Merge a PR that's ready for integration. Handles rebase, code review, CI verification, and comment resolution autonomously.

## Usage

```
/auto-merge <PR#>
```

**Example:** `/auto-merge 91`

## Prerequisites

- PR must exist and be open
- User must have merge permissions
- CI must be configured (or skippable)

## Workflow

### Step 1: Fetch PR Information

```bash
gh pr view <PR#> --json number,title,headRefName,baseRefName,state,mergeable,reviewDecision,statusCheckRollup
```

Verify:
- PR is open (`state == "OPEN"`)
- PR is against main/master

### Step 2: Checkout and Rebase

```bash
# Fetch latest
git fetch origin main
git fetch origin <branch>

# Checkout PR branch
git checkout <branch>

# Rebase onto main
git rebase origin/main
```

**If conflicts:**
1. Attempt to resolve simple conflicts
2. If complex conflicts, report and abort
3. User intervention required for complex cases

### Step 3: Run Review Pass

Use shared review logic from `.claude/shared/review-pass.md`:

1. Run `code-simplifier:code-simplifier` on changed files
2. Run `pr-review-toolkit:code-reviewer`
3. Run `pr-review-toolkit:silent-failure-hunter`
4. Fix issues with confidence >= 60%
5. Commit: `refactor: address review findings`

### Step 4: Push Updates

```bash
git push --force-with-lease origin <branch>
```

**Note:** Use `--force-with-lease` for safety after rebase.

### Step 5: Verify CI Status

```bash
gh pr checks <PR#> --watch
```

**If CI fails:**
1. Analyze failure logs
2. Fix the issue
3. Commit: `fix: resolve CI failure`
4. Push and wait for CI
5. Repeat until green (max 3 attempts)

### Step 6: Handle Review Comments

```bash
# Get unresolved comments
gh api repos/{owner}/{repo}/pulls/<PR#>/comments --jq '.[] | select(.position != null)'
```

For each unresolved comment:
1. Read the comment content
2. Evaluate if valid concern
3. If valid: make the fix, push
4. If resolved or outdated: note as addressed

### Step 7: Verify Merge Readiness

Check all conditions:
- [ ] CI green
- [ ] No unresolved blocking comments
- [ ] Branch is up-to-date with main
- [ ] PR is mergeable

```bash
gh pr view <PR#> --json mergeable,mergeStateStatus
```

### Step 8: Merge PR

```bash
gh pr merge <PR#> --squash --delete-branch
```

**Merge strategy:** Squash (consolidates commits)

### Step 9: Cleanup

```bash
# Return to main
git checkout main
git pull origin main
```

## Error Handling

### Rebase Conflicts

```
CONFLICT: Rebase failed with conflicts

Files with conflicts:
- {file1}
- {file2}

Action required: Manual conflict resolution
```

Abort and report to user.

### CI Failure (Max Retries)

```
CI FAILURE: Unable to fix after 3 attempts

Last failure:
{error summary}

Action required: Manual investigation
```

Leave PR in current state, report to user.

### Merge Blocked

```
MERGE BLOCKED

Reason: {mergeable status}

Possible causes:
- Required reviews not approved
- Status checks pending
- Branch protection rules
```

Report and exit.

## Configuration

See `config.md` for:
- Max CI retry attempts
- Confidence threshold for fixes
- Merge strategy options

## Output Format

```
AUTO-MERGE COMPLETE

## PR Merged
- PR: #<number>
- Title: <title>
- Branch: <branch> -> main

## Review Pass
- Simplifications: <count>
- Issues fixed: <count>
- Commits added: <count>

## CI Status
- Checks: <passed>/<total>
- Attempts: <count>

## Comments Addressed
- Resolved: <count>
- Skipped: <count>

## Merge
- Strategy: squash
- Branch deleted: yes

## Post-Merge
- Main updated: yes
- On branch: main
```

## Limitations

- Cannot resolve complex merge conflicts
- Cannot address comments requiring major refactoring
- Cannot bypass branch protection rules
- Max 3 CI fix attempts

## Related Skills

- `/auto-issue` - Create PR from issue
- `/auto-milestone` - Process milestone issues
- `board-manager` - Update issue status
