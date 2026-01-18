# Setup Agent

## Purpose

Initialize work on an issue: fetch details, create branch, assign self, update board status.

## Input Contract

```yaml
issue_number: number  # GitHub issue number to work on
```

## Output Contract

```yaml
issue:
  number: number
  title: string
  body: string
  labels: string[]
  milestone: string | null
branch_name: string    # Created branch name
ready: boolean         # True if setup complete
```

## Execution Steps

### 1. Validate Issue Exists

```bash
gh issue view {issue_number} --json number,title,body,labels,milestone,state
```

**Check:**
- Issue exists
- Issue is not closed
- Issue is not already assigned to someone else working on it

**If issue doesn't exist or is closed:**
- STOP and report to user

### 2. Fetch Issue Details

Parse the issue response to extract:
- Title (for branch naming)
- Body (for context)
- Labels (for type classification)
- Milestone (for scope understanding)

### 3. Determine Branch Type

Map labels or title keywords to branch type:

| Indicator | Branch Type |
|-----------|-------------|
| Label: `bug`, title: "fix" | `fix/` |
| Label: `enhancement`, `feature` | `feat/` |
| Label: `documentation` | `docs/` |
| Label: `test` | `test/` |
| Default | `feat/` |

### 4. Create Branch Name

```
{type}/{issue_number}-{slugified-title}
```

Slugify rules:
- Lowercase
- Replace spaces with hyphens
- Remove special characters
- Max 50 chars for description part

Example: `feat/12-add-typescript-parser`

### 5. Ensure Clean State

```bash
git status --porcelain
```

**If dirty:**
- STOP and ask user how to handle uncommitted changes

### 6. Create and Switch Branch

```bash
git checkout main
git pull origin main
git checkout -b {branch_name}
```

### 7. Assign Self to Issue

```bash
gh issue edit {issue_number} --add-assignee @me
```

### 8. Add In-Progress Label

```bash
gh issue edit {issue_number} --add-label "in-progress"
```

### 9. Update Board Status (if configured)

See `.claude/skills/board-manager/` for board operations.

Move issue to "In Progress" column.

### 10. Report Setup Complete

Output the contract with:
- Issue details
- Branch name
- Confirmation of assignments

## Error Handling

### Issue Not Found

```
Issue #{number} not found. Please verify the issue number.
```

### Dirty Working Directory

```
Working directory has uncommitted changes:
{list of files}

Options:
1. Stash changes: git stash
2. Commit changes first
3. Discard changes (destructive)

How would you like to proceed?
```

### Branch Already Exists

```bash
# Check if branch exists
git branch --list {branch_name}
```

If exists:
```
Branch {branch_name} already exists.

Options:
1. Switch to existing branch
2. Create with different name
3. Delete and recreate (if local only)

Which option?
```

### Network Errors

Retry once, then escalate to user.

## Completion Criteria

Setup is complete when:
- [ ] Issue details fetched successfully
- [ ] Branch created and checked out
- [ ] Self assigned to issue
- [ ] In-progress label added
- [ ] Board updated (if configured)
- [ ] Output contract populated
