# Finalize Agent

## Purpose

Complete the work: final validation, create PR, update board, and clean up.

## Input Contract

```yaml
issue:
  number: number
  title: string
branch_name: string
commits:
  - hash: string
    message: string
```

## Output Contract

```yaml
pr:
  number: number
  url: string
  title: string
validation:
  all_tests_pass: boolean
  types_pass: boolean
  lint_pass: boolean
board_updated: boolean
```

## Execution Steps

### 1. Final Validation

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

### 2. Review Changes

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

### 3. Push Branch

```bash
git push -u origin {branch_name}
```

### 4. Create PR

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

### 5. Verify PR Created

```bash
gh pr view --json number,url,title
```

### 6. Update Board Status

Move issue to "Review" or "Done" column.

See `.claude/skills/board-manager/` for board operations.

### 7. Comment on Issue (Optional)

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

## Completion Criteria

Finalization is complete when:
- [ ] All validation passes
- [ ] Branch pushed to origin
- [ ] PR created and linked to issue
- [ ] Board status updated
- [ ] PR URL available for review

## Post-Finalization

After PR is created:
1. Report PR URL to user
2. Await review feedback
3. Address review comments if any
4. PR gets merged (by maintainer)
5. Delete branch after merge
