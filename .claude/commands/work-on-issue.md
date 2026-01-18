# /work-on-issue

Start working on a GitHub issue using a structured, gated workflow.

## Usage

```
/work-on-issue <issue_number>
```

## Arguments

- `issue_number` (required): The GitHub issue number to work on

## Overview

This command orchestrates the full development workflow:

```
Setup → Research → Implement → Review → Finalize
  ↓        ↓          ↓          ↓         ↓
Branch   Plan      Code +     Validate   PR
created  approved  commits    all        created
```

**Gated workflow**: Each phase requires approval before proceeding.

## Phases

### Phase 1: Setup

**Agent**: `.claude/agents/setup-agent.md`

**Actions:**
1. Fetch issue details from GitHub
2. Create feature branch
3. Assign self to issue
4. Add "in-progress" label
5. Update board (if configured)

**Gate**: Confirm issue details and branch are correct

### Phase 2: Research

**Agent**: `.claude/agents/issue-researcher.md`

**Actions:**
1. Analyze issue requirements
2. Explore relevant codebase areas
3. Identify dependencies and risks
4. Create implementation plan

**Gate**: Approve implementation plan before coding

### Phase 3: Implement

**Agent**: `.claude/agents/atomic-developer.md`

**Actions:**
1. Execute plan step-by-step
2. Write tests first (when applicable)
3. Make atomic commits
4. Validate after each step

**Gate**: Confirm implementation is complete

### Phase 4: Review

**Actions:**
1. Run full validation suite
2. Review all changes
3. Check commit history
4. Verify requirements met

**Gate**: Confirm ready for PR

### Phase 5: Finalize

**Agent**: `.claude/agents/finalize-agent.md`

**Actions:**
1. Push branch
2. Create pull request
3. Update board status
4. Report PR URL

**Complete**: PR ready for human review

## Gate Prompts

At each gate, you'll see:

```
## Gate: {Phase Name}

**Completed:**
- {action 1}
- {action 2}

**Ready to proceed to {Next Phase}?**
- Yes: Continue to next phase
- No: Provide feedback for adjustments
- Stop: Pause workflow here
```

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

## Example Session

```
> /work-on-issue 12

## Phase 1: Setup

Fetching issue #12...

**Issue:** Add TypeScript class extraction
**Labels:** enhancement
**Milestone:** M2 - Code Graph

Creating branch: feat/12-add-typescript-class-extraction
Assigning to @me...
Adding label: in-progress

---
## Gate: Setup Complete

**Branch:** feat/12-add-typescript-class-extraction
**Issue:** #12 - Add TypeScript class extraction

Ready to proceed to Research?
> Yes

## Phase 2: Research

Analyzing issue requirements...
Exploring codebase...

**Implementation Plan:**

1. Add class visitor to TypeScript walker
   - Files: packages/core/src/parsers/typescript/class-visitor.ts
   - Tests: packages/core/src/parsers/typescript/class-visitor.test.ts

2. Extract class properties and methods
   ...

---
## Gate: Research Complete

Plan has 3 steps. Ready to implement?
> Yes

## Phase 3: Implement
...
```

## Configuration

### Board Integration

If a GitHub Project Board is configured in `.claude/skills/board-manager/`, the workflow will:
- Move issue to "In Progress" at start
- Move issue to "Review" when PR created

### Validation Commands

Customize in `.claude/shared/validation-commands.md`:
- Which commands to run
- Order of validation
- Required vs optional checks

## Shared Patterns

This command uses:
- `.claude/shared/conventional-commits.md` - Commit format
- `.claude/shared/validation-commands.md` - Test/lint/build commands
- `.claude/shared/escalation-patterns.md` - When to ask for help
- `.claude/agents/github-master.md` - Git/GitHub operations

## Troubleshooting

### "Already on branch"

You may already have started work. Check:
```bash
git branch --show-current
git status
```

### "PR already exists"

A PR may already exist for this branch:
```bash
gh pr list --head <branch-name>
```

### "Tests failing"

Run tests manually to see failures:
```bash
pnpm test --reporter=verbose
```
