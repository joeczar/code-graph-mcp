# Review Pass

Shared review logic used by finalize-agent and /auto-merge to ensure consistent quality.

## Purpose

Perform automated code review and simplification before PR creation or merge. This catches common issues and improves code quality without manual review.

## Agents Used

Run these agents in sequence on changed files:

| Order | Agent | Purpose |
|-------|-------|---------|
| 1 | `code-simplifier:code-simplifier` | Simplify and clarify changed code |
| 2 | `pr-review-toolkit:code-reviewer` | Check for bugs, style, and quality issues |
| 3 | `pr-review-toolkit:silent-failure-hunter` | Find silent failures and error suppression |

## Execution Steps

### Step 1: Identify Changed Files

```bash
# Get list of changed files vs main
git diff origin/main --name-only | grep -E '\.(ts|tsx|js|jsx)$'
```

### Step 2: Run Code Simplifier

Use the `code-simplifier:code-simplifier` agent to simplify recently modified code.

**Focus areas:**
- Redundant code patterns
- Overly complex conditionals
- Unnecessary abstractions
- Inconsistent naming

### Step 3: Run Code Reviewer

Use the `pr-review-toolkit:code-reviewer` agent on the changed files.

**Evaluates:**
- Bugs and logic errors
- Security vulnerabilities
- Code quality issues
- Project convention adherence

### Step 4: Run Silent Failure Hunter

Use the `pr-review-toolkit:silent-failure-hunter` agent.

**Looks for:**
- Swallowed exceptions
- Empty catch blocks
- Silent fallbacks that hide errors
- Missing error propagation

### Step 5: Address Findings

For issues with **confidence >= 60%**:
1. Evaluate if the finding is valid
2. Make the fix
3. Track fixes made

Skip issues below 60% confidence or clearly false positives.

### Step 6: Commit Changes

If any changes were made:

```bash
git add -A
git commit -m "refactor: address review findings"
```

**Note:** Only commit if actual changes were made. Don't create empty commits.

## Confidence Threshold

| Confidence | Action |
|------------|--------|
| >= 80% | Fix immediately |
| 60-79% | Fix if straightforward |
| < 60% | Skip (likely false positive) |

## Integration Points

### In Finalize Agent

Called after validation passes, before push:
1. Run validation (typecheck, lint, test, build)
2. Review changes (git log, git diff)
3. **Run review-pass** <- here
4. Push branch
5. Create PR

### In /auto-merge

Called after rebase, before CI check:
1. Checkout and rebase onto main
2. **Run review-pass** <- here
3. Push updates
4. Check CI status
5. Handle review comments
6. Merge

## Output Format

After review pass completes:

```
REVIEW PASS COMPLETE

## Agents Run
- [x] code-simplifier
- [x] code-reviewer
- [x] silent-failure-hunter

## Findings Addressed
- Fixed: {count} issues
- Skipped: {count} (low confidence)

## Changes Made
- {list of files changed, if any}

## Commit
- {commit hash if changes made}
- (no changes needed)
```

## Skip Conditions

Skip review pass entirely if:
- No TypeScript/JavaScript files changed
- Only documentation or config changes
- Branch has "skip-review" label

## Error Handling

If an agent fails:
1. Log the failure
2. Continue with remaining agents
3. Report which agents completed
4. Don't block on agent failures (they're advisory)
