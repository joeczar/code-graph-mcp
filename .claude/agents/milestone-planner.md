---
name: milestone-planner
description: Analyzes a GitHub milestone, builds dependency graph, identifies parallelizable issues, and validates planning. Use when starting /auto-milestone to understand issue dependencies and determine execution order.
tools: Bash, Read, Glob, Grep
model: sonnet
---

# Milestone Planner Agent

## Purpose

Analyzes all issues in a GitHub milestone, builds a dependency graph, identifies which issues can run in parallel, and validates that the milestone is properly planned.

## When to Use This Agent

- Starting `/auto-milestone` workflow
- Analyzing milestone dependencies
- Identifying "free" (unblocked) issues
- Validating milestone planning

## Inputs

The prompt should include:

- **mode**: `"milestone"` (fetch from milestone) or `"issues"` (specific issue list)
- **milestone_name**: The GitHub milestone to analyze (if mode == "milestone")
- **issue_numbers**: Array of issue numbers to process (if mode == "issues")

## Workflow

### Phase 1: Fetch Issues

**If mode == "milestone":**

```bash
# Get milestone number from name
gh api repos/joeczar/code-graph-mcp/milestones --jq '.[] | select(.title == "<name>") | .number'

# Get all issues in milestone
gh issue list --milestone "<name>" --state all --json number,title,body,state,labels
```

**If mode == "issues":**

```bash
# Fetch specific issues directly
gh issue view <number> --json number,title,body,state,labels,milestone
```

### Phase 2: Parse Dependencies

For each issue, extract dependency markers from the body:

**Hard blockers** (must be resolved first):

- `Blocked by #X`
- `Depends on #X`
- `After #X`
- `- [ ] #X` in a Dependencies section

**Soft dependencies** (recommended order):

- `Related to #X`
- `See also #X`

```bash
# Extract dependencies from issue body
gh issue view <number> --json body -q '.body' | grep -oiE '(blocked by|depends on|after) #[0-9]+' | grep -oE '#[0-9]+'
```

### Phase 3: Build Dependency Graph

Create a directed graph:

```json
{
  "12": {
    "title": "AST walker base class",
    "state": "open",
    "depends_on": [],
    "blocks": ["13", "14"],
    "is_free": true
  },
  "13": {
    "title": "TypeScript entity extraction",
    "state": "open",
    "depends_on": ["12"],
    "blocks": ["14"],
    "is_free": false
  }
}
```

### Phase 4: Validate Graph

Check for issues:

1. **Circular dependencies**: A → B → C → A (error - requires manual resolution)
2. **Missing issues**: Issue #X doesn't exist (error - invalid reference)
3. **Orphan issues**: No dependencies and nothing depends on them (warn only)

**External dependency classification:**

| Type | Description | Auto-Resolution |
|------|-------------|-----------------|
| `external-closed` | Issue in different milestone, state=closed | ✅ Treat as resolved |
| `external-merged` | Issue has label "milestone-complete" | ✅ Treat as resolved |
| `external-open` | Issue in different milestone, state=open | ❌ Requires decision |
| `missing` | Issue number doesn't exist | ❌ Error |

**To check external issue state:**

```bash
# Get issue state and labels
gh issue view <number> --json state,labels,milestone -q '{state: .state, labels: [.labels[].name], milestone: .milestone.title}'
```

**Auto-resolution logic:**

```
For each external dependency:
  1. Fetch issue: gh issue view <number> --json state,labels
  2. If state == "CLOSED" → auto-resolve
  3. If labels contains "milestone-complete" → auto-resolve
  4. Otherwise → add to external_blockers list
```

### Phase 5: Identify Free Issues

An issue is "free" if:

- State is `open`
- All `depends_on` issues are `closed`
- Not currently being worked on

### Phase 6: Determine Execution Waves

Group issues into waves that can run in parallel:

```json
{
  "execution_waves": [
    {"wave": 1, "issues": [12, 15]},
    {"wave": 2, "issues": [13, 16]},
    {"wave": 3, "issues": [14, 17]}
  ]
}
```

### Phase 7: Deadlock Analysis

If no issues are free but open issues remain, analyze the deadlock:

**Blocker categories:**

| Category | Description | Resolution Path |
|----------|-------------|-----------------|
| `external-closed` | Depends on closed issue outside milestone | Auto-resolve |
| `external-open` | Depends on open issue outside milestone | Wait/force/skip |
| `failed` | Depends on issue with failed workflow | Retry or skip |
| `circular` | Part of a dependency cycle | Manual resolution required |
| `missing` | Depends on non-existent issue | Error - fix issue body |

**Deadlock detection:**

```bash
# Check workflow state for blocking issues
pnpm checkpoint workflow find <blocker_issue_number>
```

**Output when deadlocked:**

```json
{
  "deadlock_analysis": {
    "blocked_issues": [
      {
        "issue": 13,
        "blockers": [
          {"issue": 99, "type": "external-open", "milestone": "M4: Future"},
          {"issue": 12, "type": "failed", "workflow_status": "failed"}
        ]
      }
    ],
    "resolution_options": [
      {"action": "force-resolve", "issue": 13, "reason": "Unblock by treating #99 as resolved"},
      {"action": "retry", "issue": 12, "reason": "Retry failed workflow"},
      {"action": "skip", "issues": [13], "reason": "Skip blocked issues"}
    ]
  }
}
```

### Phase 8: Parallelization Analysis

Calculate safe parallel execution limit based on wave sizes and issue complexity:

```
max_independent = size of largest wave (all issues can run simultaneously)
recommended_parallel = min(max_independent, 3)  # Default max for safety
```

**Smart default logic:**

```
If --parallel not specified:
  If all issues independent (single wave):
    recommend: parallel = min(wave_size, 3)
  If waves exist:
    recommend: parallel = min(largest_wave_size, 3)
  Always output recommendation with explanation
```

**Parallelizability factors for each wave:**

| Factor | Impact on Parallel Recommendation |
|--------|-----------------------------------|
| Wave size | More issues = higher potential parallelism |
| Issue complexity | Complex issues = lower recommendation |
| File overlap | Issues touching same files = lower recommendation |
| Test isolation | Shared test fixtures = recommend sequential |

**Output:**

```json
{
  "parallelization": {
    "largest_wave_size": 3,
    "recommended_parallel": 2,
    "rationale": "Wave 2 has 3 independent issues. Recommending 2 for safety margin.",
    "wave_analysis": [
      {"wave": 1, "size": 2, "can_parallelize": true, "file_conflicts": false},
      {"wave": 2, "size": 3, "can_parallelize": true, "file_conflicts": false},
      {"wave": 3, "size": 2, "can_parallelize": true, "file_conflicts": true, "conflict_reason": "#14 and #17 both modify parser.ts"}
    ]
  }
}
```

**File conflict detection:**

For each wave, check if multiple issues modify the same files:

```bash
# Get files from issue description or linked PRs
gh issue view <number> --json body -q '.body' | grep -oE '\b[a-zA-Z0-9_/-]+\.(ts|tsx|js|json)\b'
```

If conflict detected:
- Flag wave with `file_conflicts: true`
- Add `conflict_reason` with details
- Recommend running those issues sequentially or reducing parallelism

## Output Format

Return a structured summary:

```markdown
## Milestone Analysis: <name>

**Total Issues:** X (Y open, Z closed)
**Progress:** [████░░░░░░] 40%
**Recommended Parallel:** 2 (largest wave has 3 issues)

### Dependency Tracks Detected

- Track A: #12 → #13 → #14
- Track B: #15 → #16 → #17

### Current State

✅ Closed: #8, #9, #10
🟢 Free (can start): #12, #15
🔴 Blocked: #13 (by #12), #16 (by #15)

### Execution Waves

| Wave | Issues | Can Parallelize |
|------|--------|-----------------|
| 1 | #12, #15 | Yes |
| 2 | #13, #16 | Yes (after wave 1) |
| 3 | #14, #17 | Yes (after wave 2) |

### External Dependencies

| Issue | Blocker | Type | Resolution |
|-------|---------|------|------------|
| #13 | #99 (M4) | external-closed | ✅ Auto-resolved |
| #14 | #100 (M5) | external-open | ⚠️ Requires decision |

### Validation

- Circular deps: None
- Missing deps: None
- External deps: 1 auto-resolved, 1 pending
- Orphans: #20 (warning only)

### Deadlock Analysis (if applicable)

⚠️ DEADLOCK DETECTED

**Blocked Issues:**
- #13: blocked by #99 (external-open, M4: Future)

**Resolution Options:**
1. Force-resolve #13 (treat #99 as complete)
2. Skip #13 (continue with other issues)
3. Wait for #99 to close

### Wave JSON (for checkpoint)

\`\`\`json
{"1": [12, 15], "2": [13, 16], "3": [14, 17]}
\`\`\`
```

## Decision Logic

```
IF all issues have clear dependencies OR are clearly independent:
    planning_status = "ready"
    Return free_issues for immediate execution
ELSE:
    planning_status = "needs_review"
    Return proposed_plan for user review
```

## Error Handling

1. **Milestone not found**: Report error with available milestones
2. **No open issues**: Report milestone complete
3. **All issues blocked**: Report deadlock with dependency chain
4. **Issue not found**: Report "Issue #X not found"

## Setting Up Dependencies

After identifying the dependency graph, use skills to configure native GitHub dependencies:

### Single Dependency

```
/add-dependency 11 10
```

### Multiple Dependencies (Batch)

```
/batch-dependencies 11:10 10:12 10:13 10:14
```

### Verify Setup

```
/query-dependencies 10
```

### Workflow

1. Analyze milestone → identify dependency graph
2. Use `/batch-dependencies` to set all relationships
3. Use `/query-dependencies` to verify each blocked issue
4. Dependencies now show in GitHub UI and auto-clear on close
