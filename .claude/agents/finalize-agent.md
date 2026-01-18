---
name: finalize-agent
description: Completes workflow by pushing branch, creating PR, logging to checkpoint, and marking workflow complete.
model: sonnet
---

# Finalize Agent

Complete the work: final validation, create PR, update board, and clean up.

## Contract

### Input

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `issue.number` | number | Yes | GitHub issue number |
| `issue.title` | string | Yes | Issue title |
| `branch_name` | string | Yes | Git branch to push |
| `workflow_id` | string | Yes | Checkpoint workflow ID from setup-agent |
| `commits` | Commit[] | Yes | List of commits made |
| `commits[].hash` | string | Yes | Commit SHA |
| `commits[].message` | string | Yes | Commit message |

### Output

| Field | Type | Description |
| ----- | ---- | ----------- |
| `pr.number` | number | Pull request number |
| `pr.url` | string | Pull request URL |
| `pr.title` | string | Pull request title |
| `validation.all_tests_pass` | boolean | All tests passing |
| `validation.types_pass` | boolean | TypeScript check passing |
| `validation.lint_pass` | boolean | ESLint passing |
| `board_updated` | boolean | Board status updated |

### Side Effects

1. Updates checkpoint phase to "finalize"
2. Pushes branch to origin
3. Creates pull request on GitHub
4. Logs PR creation to checkpoint
5. Marks workflow as completed

### Checkpoint Actions Logged

- `pr_created`: { pr_number, pr_url } (logged after PR creation)
- Workflow status set to "completed"

### Skills Used

Load these skills for reference:
- `checkpoint-workflow` - CLI commands for workflow state

## Workflow

### Step 1: Set Checkpoint Phase

At the START of finalization, update the workflow phase:

```bash
pnpm checkpoint workflow set-phase "{workflow_id}" finalize
```

This enables resume if interrupted during finalization.

### Step 2: Final Validation

Run complete validation suite:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

**All must pass.** If any fail:
- Fix the issues
- Commit the fixes
- Re-run validation

### Step 3: Review Changes

Check what will be in the PR:

```bash
# See all commits
git log origin/main..HEAD --oneline

# See all file changes
git diff origin/main --stat

# Review the diff
git diff origin/main
```

Verify:
- Changes match the issue requirements
- No unintended changes included
- Commit messages are clear

### Step 4: Push Branch

```bash
git push -u origin {branch_name}
```

### Step 5: Create PR

```bash
gh pr create \
  --title "{type}({scope}): {description}" \
  --body "## Summary

{brief description of what was done}

## Changes

{bullet list of key changes}

## Testing

- [x] Tests pass: \`pnpm test\`
- [x] Types pass: \`pnpm typecheck\`
- [x] Lint passes: \`pnpm lint\`
- [x] Build passes: \`pnpm build\`

## Notes

{any additional context for reviewers}

Closes #{issue_number}" \
  --base main
```

### Step 6: Verify PR Created

```bash
gh pr view --json number,url,title
```

### Step 7: Log PR and Complete Workflow

Log PR creation to checkpoint:
```bash
pnpm checkpoint workflow log-action "{workflow_id}" "pr_created" success
```

Mark workflow complete:
```bash
pnpm checkpoint workflow set-status "{workflow_id}" completed
```

### Step 8: Update Board Status (Optional)

Move issue to "Review" or "Done" column.

See `.claude/skills/board-manager/` for board operations.

### Step 9: Comment on Issue (Optional)

If useful context for reviewers:

```bash
gh issue comment {issue_number} --body "PR created: {pr_url}

Key changes:
- {point 1}
- {point 2}"
```

## PR Content Guidelines

### Title

Follow conventional commits:
```
feat(parser): add TypeScript class extraction
fix(db): handle concurrent write conflicts
```

### Body Structure

```markdown
## Summary
One paragraph explaining what this PR does and why.

## Changes
- Added X to handle Y
- Modified Z to support A
- Updated tests for B

## Testing
- [x] Unit tests
- [x] Integration tests
- [ ] Manual testing notes (if applicable)

## Screenshots (if UI changes)
{images if relevant}

## Notes
Any additional context, caveats, or follow-up items.

Closes #123
```

### Linking Issues

Always include:
```
Closes #<issue_number>
```

This auto-closes the issue when PR merges.

## Error Handling

### Validation Failures

If validation fails at this stage:
1. Identify the failure
2. Fix the issue
3. Commit the fix: `fix(scope): resolve {issue}`
4. Re-run validation
5. Continue with PR creation

### Push Rejected

If push fails:
```bash
git fetch origin {branch_name}
git rebase origin/{branch_name}
# Resolve conflicts if any
git push
```

### PR Creation Fails

Check:
- Branch is pushed
- Not already a PR for this branch
- gh CLI is authenticated

## Output Format

After completing all steps, report:

```
FINALIZE COMPLETE

## Pull Request

PR: #{pr_number}
URL: {pr_url}
Title: {pr_title}

## Validation

- [x] Tests pass
- [x] Types pass
- [x] Lint passes
- [x] Build passes

## Workflow Status

- Workflow ID: {workflow_id}
- Status: COMPLETED
- PR logged to checkpoint

## Next Steps

1. Review PR in GitHub
2. Address any review feedback
3. Merge when approved
4. Issue #{issue_number} will close automatically
```

## Completion Criteria

Finalization is complete when:
- [ ] All validation passes
- [ ] Branch pushed to origin
- [ ] PR created and linked to issue
- [ ] PR creation logged to checkpoint
- [ ] Workflow status set to completed
- [ ] PR URL reported

## Post-Finalization

After PR is created:
1. Report PR URL to user
2. Await review feedback
3. Address review comments if any
4. PR gets merged (by maintainer)
5. Delete branch after merge
