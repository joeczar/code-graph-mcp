# /work-on-issue

Start working on a GitHub issue using a structured, gated workflow.

## Usage

```
/work-on-issue <issue_number>
```

## Arguments

- `issue_number` (required): The GitHub issue number to work on

## Agents Summary

| Phase | Agent | Purpose |
|-------|-------|---------|
| 1 | `setup-agent` | Branch, checkpoint, issue assignment |
| 2 | `issue-researcher` | Analyze issue, create implementation plan |
| 3 | `atomic-developer` | Incremental implementation with commits |
| 4 | (review tools) | Validation and code review |
| 5 | `finalize-agent` | Push branch, create PR, complete workflow |

## Workflow Overview

```
Setup → Research → Implement → Review → Finalize
  ↓        ↓          ↓          ↓         ↓
GATE 1   GATE 2     GATE 3     GATE 4    DONE
```

**Gated workflow**: Each phase requires explicit approval before proceeding.

---

## Resume from Checkpoint

Before starting Phase 1, check for an existing workflow:

```bash
pnpm checkpoint workflow find {issue_number}
```

**If a running workflow exists:**

Show to user:
```
Existing workflow found for issue #{issue_number}:
- Workflow ID: {id}
- Current phase: {current_phase}
- Last updated: {updated_at}
- Recent actions: {list of recent actions}

Options:
1. Resume from {current_phase} phase
2. Start fresh (creates new workflow)
```

If resuming, jump to the saved phase with the existing `workflow_id`.

---

## Phase 1: Setup

**Agent:** `setup-agent`

Task(setup-agent):
  Input:  { issue_number: <N> }
  Output: { workflow_id, branch, issue, resumed }

The setup-agent will:
- Fetch issue details from GitHub
- Create feature branch (or checkout existing)
- Create checkpoint workflow (or resume existing)
- Assign self to issue
- Add "in-progress" label

---

## GATE 1: Issue Review

**STOP** - Hard gate requiring explicit approval.

**Show to user:**

```
SETUP COMPLETE

Issue: #{number} - {title}
Branch: {branch}
Workflow ID: {workflow_id}

Issue Body:
{full issue body}

Labels: {labels}
Milestone: {milestone if any}
```

**Wait for:** "proceed", "yes", "go ahead", "approved"

**Do NOT continue until explicit approval received.**

---

## Phase 2: Research

**Agent:** `issue-researcher`

Task(issue-researcher):
  Input:  { issue, branch, workflow_id }
  Output: { analysis, plan, context }

The issue-researcher will:
- Set checkpoint phase to "research"
- Analyze issue requirements
- Explore relevant codebase areas
- Identify dependencies and risks
- Create implementation plan
- Log plan creation to checkpoint

---

## GATE 2: Plan Approval

**STOP** - Hard gate requiring explicit approval.

**Show to user:**

```
RESEARCH COMPLETE

## Issue Analysis: #{number} - {title}

### Summary
{one-line summary}

### Type & Scope
- Type: {feat|fix|refactor|test|docs}
- Scope: {package/area}
- Complexity: {low|medium|high}

### Approach
{high-level strategy}

### Implementation Steps

1. **{Step title}**
   - Files: {list}
   - Tests: {list}

2. **{Step title}**
   ...

### Risks
- {risk 1}
- {risk 2}

### Questions (if any)
- {question 1}
```

**Wait for:** "proceed", "approved", or feedback for adjustments

**Do NOT continue until explicit approval received.**

---

## Phase 3: Implement

**Agent:** `atomic-developer`

Task(atomic-developer):
  Input:  { plan, branch, workflow_id }
  Output: { commits, validation, completed_steps }

The atomic-developer will:
- Set checkpoint phase to "implement"
- Execute plan step-by-step
- Write tests first (when applicable)
- Make atomic commits (one logical change each)
- Log each commit to checkpoint
- Validate after each step (tests, types, lint)
- Log implementation complete

**Implementation loop:**
```
For each step in plan:
  1. Write/update tests
  2. Implement the change
  3. Run validation (pnpm typecheck && pnpm test && pnpm lint)
  4. Commit with conventional commit message
  5. Log commit to checkpoint
```

---

## GATE 3: Implementation Review

**STOP** - Hard gate requiring explicit approval.

**Show to user:**

```
IMPLEMENTATION COMPLETE

## Commits Made

{list of commits with hashes and messages}

## Files Changed

{git diff --stat output}

## Validation Status

- Tests: {pass/fail}
- Types: {pass/fail}
- Lint: {pass/fail}
```

**Wait for:** "proceed", "approved", or feedback for adjustments

**Do NOT continue until explicit approval received.**

---

## Phase 4: Review Agents (MANDATORY)

**CRITICAL:** This phase runs automated review agents. Do NOT skip this phase.

### Step 1: Identify Changed Files

```bash
git diff origin/main --name-only | grep -E '\.(ts|tsx|js|jsx)$'
```

If no TypeScript/JavaScript files changed, skip to validation.

### Step 2: Run Review Agents (in sequence)

Run each agent and track completion:

| Agent | Purpose | Status |
|-------|---------|--------|
| `code-simplifier:code-simplifier` | Simplify and clarify code | ☐ |
| `pr-review-toolkit:code-reviewer` | Check bugs, style, quality | ☐ |
| `pr-review-toolkit:silent-failure-hunter` | Find silent failures | ☐ |

**For each agent:**
1. Launch the agent via Task tool
2. Review findings with confidence >= 60%
3. Apply valid fixes
4. Mark agent as complete (☑)

### Step 3: Commit Review Fixes

If any changes were made:
```bash
git add -A
git commit -m "refactor: address review findings"
```

### Step 4: Final Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### Step 5: Review Summary

```bash
git log origin/main..HEAD --oneline
git diff origin/main --stat
```

Verify:
- All validation passes
- Review agents completed (all ☑)
- Changes match issue requirements
- Commit messages are clear

---

## GATE 4: Ready for PR

**STOP** - Hard gate requiring explicit approval.

**Show to user:**

```
REVIEW COMPLETE

## Review Agents
- [x] code-simplifier ran
- [x] code-reviewer ran
- [x] silent-failure-hunter ran
- Findings addressed: {count}

## Validation
- [x] Tests pass
- [x] Types pass
- [x] Lint passes
- [x] Build passes

## Changes
{git diff origin/main --stat}

Ready to create PR?
```

**IMPORTANT:** If any review agent was skipped, do NOT proceed. Return to Phase 4 and run the missing agents.

**Wait for:** "proceed", "create PR", "approved"

**Do NOT continue until explicit approval received.**

---

## Phase 5: Finalize

**Agent:** `finalize-agent`

Task(finalize-agent):
  Input:  { issue, branch, workflow_id, commits }
  Output: { pr, validation, board_updated }

The finalize-agent will:
- Set checkpoint phase to "finalize"
- Push branch to origin
- Create pull request linked to issue
- Log PR creation to checkpoint
- Mark workflow as completed
- Report PR URL

---

## Complete

**Show to user:**

```
WORKFLOW COMPLETE

PR: {pr_url}
Issue: #{number} will close when PR merges

Next steps:
1. Review PR in GitHub
2. Address any review feedback
3. Merge when approved
```

---

## Error Handling

### Issue Not Found

```
Error: Issue #<number> not found.

Please verify:
1. Issue number is correct
2. You have access to the repository
```

### Dirty Working Directory

```
Warning: Uncommitted changes detected.

Options:
1. Stash changes and continue
2. Commit changes first
3. Stop workflow
```

### Validation Failures

If tests/lint/types fail:
1. Fix the issues
2. Commit fixes
3. Re-run validation
4. Continue workflow

---

## Shared Patterns

This command uses:
- `.claude/shared/conventional-commits.md` - Commit format
- `.claude/shared/validation-commands.md` - Test/lint/build commands
- `.claude/shared/escalation-patterns.md` - When to ask for help
- `.claude/shared/checkpoint-patterns.md` - Checkpoint logging patterns
- `.claude/agents/github-master.md` - Git/GitHub operations
- `.claude/skills/checkpoint-workflow/SKILL.md` - Checkpoint CLI reference
