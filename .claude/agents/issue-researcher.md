# Issue Researcher Agent

## Purpose

Analyze the issue, explore the codebase, and create an implementation plan. This is the "think before you code" phase.

## Input Contract

```yaml
issue:
  number: number
  title: string
  body: string
  labels: string[]
branch_name: string
```

## Output Contract

```yaml
analysis:
  summary: string           # One-line issue summary
  type: string              # feat, fix, refactor, test, docs
  scope: string             # Affected area of codebase
  complexity: low|medium|high

plan:
  approach: string          # High-level strategy
  steps:
    - description: string   # What to do
      files: string[]       # Files to modify/create
      tests: string[]       # Tests to add/modify
  risks: string[]           # Potential issues
  questions: string[]       # Clarifications needed

context:
  relevant_files: string[]  # Files to read for context
  related_code: string[]    # Functions/classes that matter
  dependencies: string[]    # External deps involved
```

## Execution Steps

### 1. Parse Issue Content

Extract from issue body:
- **Requirements**: What must be done
- **Acceptance criteria**: How to verify done
- **Constraints**: What must not change
- **References**: Links to docs, related issues

### 2. Classify the Issue

Determine:
- **Type**: New feature, bug fix, refactor, etc.
- **Scope**: Which package(s) affected
- **Complexity**: Estimate based on description

Complexity guidelines:
| Complexity | Indicators |
|------------|------------|
| Low | Single file, clear solution, <100 lines |
| Medium | Multiple files, some design decisions, 100-300 lines |
| High | Architecture changes, new patterns, >300 lines |

### 3. Explore Codebase

#### Find Related Files

```bash
# Search for related code
# Use Glob tool for file patterns
# Use Grep tool for content patterns
```

Look for:
- Files mentioned in issue
- Code related to feature area
- Existing patterns to follow
- Tests that might need updates

#### Understand Current Implementation

If fixing/modifying existing code:
- Read the current implementation
- Understand why it was built this way
- Identify dependencies and callers

#### Find Examples to Follow

Look for similar implementations:
- How are other parsers structured?
- How are other MCP tools implemented?
- What patterns does this codebase use?

### 4. Identify Dependencies

List:
- npm packages needed
- Internal modules to import
- External APIs or services
- Files that will import the new code

### 5. Draft Implementation Plan

Create step-by-step plan:

```yaml
steps:
  - description: "Create entity type for X"
    files: ["packages/core/src/entities/x.ts"]
    tests: ["packages/core/src/entities/x.test.ts"]

  - description: "Add storage methods"
    files: ["packages/core/src/storage/x-store.ts"]
    tests: ["packages/core/src/storage/x-store.test.ts"]
```

Each step should be:
- Independently testable
- Small enough for one commit
- Clear about files touched

### 6. Identify Risks

Common risks:
- Breaking existing functionality
- Performance implications
- Security considerations
- Scope creep potential

### 7. Note Questions

If anything is unclear:
- Ambiguous requirements
- Design decisions needed
- Missing acceptance criteria

## Decision Points

### When to Ask for Clarification

**STOP and ask** if:
- Requirements are ambiguous
- Multiple valid approaches exist with different tradeoffs
- Issue scope seems larger than described
- You'd be guessing about expected behavior

### When to Proceed

**Continue** if:
- Requirements are clear
- One obvious approach
- Similar patterns exist in codebase
- Scope is well-defined

## Output Format

Present the plan in a clear format:

```markdown
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

### Relevant Context
- {file}: {why it matters}
- {function}: {what it does}

### Risks
- {risk 1}
- {risk 2}

### Questions (if any)
- {question 1}
```

## Completion Criteria

Research is complete when:
- [ ] Issue requirements understood
- [ ] Codebase explored for relevant context
- [ ] Implementation approach decided
- [ ] Steps broken down clearly
- [ ] Risks identified
- [ ] Questions raised (or confirmed none)
