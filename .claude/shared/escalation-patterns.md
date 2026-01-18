# Escalation Patterns

## When to Stop and Ask

### Architecture Decisions

**STOP** when facing:
- New package/module structure decisions
- Database schema changes beyond current migration
- API surface changes (MCP tool signatures)
- Dependency additions (new npm packages)

**Ask:** "I'm considering [decision]. This affects [scope]. Should I proceed with [approach A] or [approach B]?"

### Scope Creep

**STOP** when:
- Fix requires changes in 3+ unrelated files
- "Quick fix" is turning into refactor
- Original issue reveals deeper architectural problem

**Ask:** "This issue is larger than expected. Should I: (A) minimal fix now + new issue, or (B) address root cause?"

### Test Failures

**STOP** when:
- Test failure is in unrelated code
- Can't understand why test is failing
- Test seems wrong (testing implementation, not behavior)

**Ask:** "Test [name] is failing. I believe [analysis]. Should I: (A) fix code, (B) fix test, or (C) investigate more?"

### Blocked Progress

**STOP** after:
- 3 failed attempts at same approach
- 15 minutes on single problem without progress
- Hitting external dependency issues

**Ask:** "I'm blocked on [problem]. Tried [approaches]. Options: (A) [workaround], (B) [different approach], (C) need help."

## When to Proceed

### Safe to Continue

- Following established patterns in codebase
- Changes are within scope of current issue
- Tests pass after changes
- No new dependencies or architecture changes

### Standard Decisions

Proceed with these defaults (unless issue specifies otherwise):
- Use existing code style/patterns
- Prefer composition over inheritance
- Use explicit types over inference
- Add tests for new functionality
- Update inline docs when changing behavior

## Escalation Format

```
## Escalation: [Brief Title]

**Context:** What I was doing
**Problem:** What went wrong or needs decision
**Analysis:** What I've tried or considered
**Options:**
A) [First option] - [tradeoff]
B) [Second option] - [tradeoff]
C) [Third option if applicable]

**Recommendation:** [If I have one]
```

## Example Escalations

### Scope Creep

```
## Escalation: Issue #12 Expanding

**Context:** Adding TypeScript class extraction
**Problem:** Found that method extraction shares 70% code with function extraction
**Analysis:** Could refactor to share code, but that's not in scope

**Options:**
A) Duplicate code now, refactor later - ships faster, tech debt
B) Refactor first - cleaner, but 2x scope
C) Minimal shared helper - middle ground

**Recommendation:** A - ship the feature, create issue for refactor
```

### Architecture Decision

```
## Escalation: Entity ID Strategy

**Context:** Implementing entity storage
**Problem:** Need to decide on entity ID format
**Analysis:** Options have different tradeoffs for querying vs stability

**Options:**
A) UUID - simple, no collisions, no semantic meaning
B) Hash of content - deterministic, allows dedup, changes on edit
C) Path-based - human readable, tied to file location

**Recommendation:** Need input - this affects query patterns
```
