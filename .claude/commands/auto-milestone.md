# /auto-milestone $ARGUMENTS

Analyze and optionally execute a milestone's issues in dependency order.

## Quick Reference

```bash
/auto-milestone "M3: Code Graph"              # Analyze milestone
/auto-milestone "M3: Code Graph" --execute    # Analyze and execute
/auto-milestone 12 13 14                      # Specific issues
```

## Arguments

| Argument | Description |
|----------|-------------|
| Milestone name | Analyze all issues in the milestone |
| Issue numbers | Analyze specific issues (space-separated) |
| `--execute` | Actually run /auto-issue for each (default: analyze only) |
| `--parallel N` | Max concurrent issues (default: 1) |

## Workflow

```
Phase 1: Plan     → milestone-planner → GATE (if dependencies unclear)
Phase 2: Execute  → spawn /auto-issue for each free issue
Phase 3: Monitor  → track progress, handle completion
Phase 4: Report   → summary of results
```

---

## Phase 1: Plan

**Agent:** `milestone-planner`

```
Task(milestone-planner):
  Input:  { mode: "milestone" | "issues", milestone_name | issue_numbers }
  Output: { planning_status, free_issues[], dependency_graph, execution_waves[] }
```

The milestone-planner will:

1. Fetch all issues in milestone (or specified issues)
2. Parse dependency markers from issue bodies
3. Build dependency graph
4. Identify free (unblocked) issues
5. Return waves for execution

### Output

```markdown
## Milestone: M3: Code Graph

**Progress:** 0/16 (0%)
**Planning Status:** ready

### Execution Waves

| Wave | Issues | Description |
|------|--------|-------------|
| 1 | #12 | AST walker base class |
| 2 | #13, #15 | TS/Ruby entity extraction |
| 3 | #14, #16 | TS/Ruby relationship extraction |
| ... | ... | ... |

### Free Issues (can start now)
- #12: AST walker base class with node visitor pattern
```

---

## Phase 2: Execute (if --execute)

**GATE: Confirm before execution**

```
Ready to execute milestone "M3: Code Graph"

Will process 16 issues in 6 waves:
- Wave 1: #12
- Wave 2: #13, #15
- ...

Proceed? [y/N]
```

For each free issue, spawn `/auto-issue`:

```
Task(auto-issue):
  Input:  { issue_number }
  Output: { status, pr_number, error? }
```

After each issue completes:
1. Check if any blocked issues are now free
2. Add newly free issues to queue
3. Continue until all done

---

## Phase 3: Monitor

Track progress in real-time:

```markdown
## Progress: M3: Code Graph

Wave 1: ✅ Complete
- #12: ✅ PR #30 merged

Wave 2: 🔄 In Progress
- #13: 🔄 PR #31 (CI running)
- #15: ✅ PR #32 merged

Wave 3: ⏳ Waiting
- #14: Blocked by #13
- #16: Blocked by #15 ✅
```

---

## Phase 4: Report

Final summary:

```markdown
## Milestone Complete: M3: Code Graph

**Duration:** 2h 15m
**Issues:** 16/16 complete
**PRs Created:** 16
**PRs Merged:** 16

### Results by Wave

| Wave | Issues | Status |
|------|--------|--------|
| 1 | #12 | ✅ Merged |
| 2 | #13, #15 | ✅ Merged |
| ... | ... | ... |

### Issues
- #12: ✅ PR #30
- #13: ✅ PR #31
- ...
```

---

## Error Handling

| Error | Behavior |
|-------|----------|
| Milestone not found | Show available milestones, exit |
| Issue not found | Skip issue, continue with others |
| Circular dependency | Report cycle, ask for resolution |
| /auto-issue failure | Log error, mark as failed, continue |
| All issues blocked | Report deadlock, exit |

---

## Example Usage

### Analyze Only (default)

```bash
/auto-milestone "M2: MCP Server Foundation"
```

Shows dependency analysis without executing anything.

### Execute Milestone

```bash
/auto-milestone "M2: MCP Server Foundation" --execute
```

Analyzes, confirms, then executes each issue via /auto-issue.

### Specific Issues

```bash
/auto-milestone 5 6 7 8 --execute
```

Process only issues #5, #6, #7, #8 in dependency order.
