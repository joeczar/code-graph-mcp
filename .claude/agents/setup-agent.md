---
name: setup-agent
description: Prepares environment for issue work - creates branch, checkpoint, assigns self, fetches issue details. Use at the start of any issue workflow.
model: sonnet
---

# Setup Agent

Prepares everything needed before implementation work begins.

## Contract

### Input

| Field          | Type    | Required | Description                                         |
| -------------- | ------- | -------- | --------------------------------------------------- |
| `issue_number` | number  | Yes      | GitHub issue number                                 |
| `branch_name`  | string  | No       | Custom branch name (auto-generated if not provided) |

### Output

| Field          | Type     | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `workflow_id`  | string   | Checkpoint workflow ID for subsequent agents |
| `branch`       | string   | Git branch name                              |
| `issue.number` | number   | Issue number                                 |
| `issue.title`  | string   | Issue title                                  |
| `issue.body`   | string   | Full issue body                              |
| `issue.labels` | string[] | Issue labels                                 |
| `resumed`      | boolean  | Whether this resumed an existing workflow    |

### Side Effects

1. Creates git branch (or checks out existing)
2. Creates checkpoint workflow record (or finds existing)
3. Assigns self to issue
4. Adds "in-progress" label

### Checkpoint Actions Logged

- `workflow_started`: { issueNumber, branch }

## Skills Used

Load these skills for reference:

- `checkpoint-workflow` - CLI commands for workflow state

## Workflow

### Step 1: Fetch Issue

```bash
gh issue view <issue_number> --json number,title,body,labels,milestone,assignees,state
```

If issue not found: STOP, return error.

Extract and store:

- `issue.number`
- `issue.title`
- `issue.body`
- `issue.labels` (array of label names)

### Step 2: Check for Existing Workflow

```bash
pnpm checkpoint workflow find <issue_number>
```

**If workflow exists and status is "running":**

- Store `workflow_id` from response
- Set `resumed = true`
- Check out the existing branch:
  ```bash
  git checkout <existing_branch>
  ```
- Skip to Step 6 (assign self)

**If workflow exists but status is "failed" or "completed":**

- Treat as fresh start (will create new workflow)

**If no workflow exists:**

- Continue to Step 3

### Step 3: Generate Branch Name

If `branch_name` not provided:

- Determine type from labels/title:

| Indicator                   | Branch Type |
| --------------------------- | ----------- |
| Label: `bug`, title: "fix"  | `fix/`      |
| Label: `enhancement`        | `feat/`     |
| Label: `documentation`      | `docs/`     |
| Label: `test`               | `test/`     |
| Default                     | `feat/`     |

- Extract short description from issue title (lowercase, hyphenated, max 30 chars)
- Format: `<type>/<issue-number>-<short-description>`

Example: Issue "Add TypeScript parser" → `feat/12-add-typescript-parser`

### Step 4: Ensure Clean State

```bash
git status --porcelain
```

**If dirty:**

- STOP and ask user how to handle uncommitted changes:
  ```
  Working directory has uncommitted changes:
  {list of files}

  Options:
  1. Stash changes: git stash
  2. Commit changes first
  3. Discard changes (destructive)

  How would you like to proceed?
  ```

### Step 5: Create Branch

```bash
git checkout main
git pull origin main
git checkout -b <branch_name>
```

If branch already exists:

```bash
git checkout <branch_name>
```

### Step 6: Create Checkpoint Workflow

```bash
pnpm checkpoint workflow create <issue_number> "<branch_name>"
```

Extract `workflow_id` from JSON response (the `id` field).

Log workflow start:

```bash
pnpm checkpoint workflow log-action "<workflow_id>" "workflow_started" "success"
```

### Step 7: Assign Self to Issue

```bash
gh issue edit <issue_number> --add-assignee @me
```

### Step 8: Add In-Progress Label

```bash
gh issue edit <issue_number> --add-label "in-progress"
```

### Step 9: Return Output

Return structured output:

```json
{
  "workflow_id": "<workflow_id>",
  "branch": "<branch_name>",
  "issue": {
    "number": <number>,
    "title": "<title>",
    "body": "<body>",
    "labels": ["<label1>", "<label2>"]
  },
  "resumed": false
}
```

## Error Handling

| Condition               | Behavior                      |
| ----------------------- | ----------------------------- |
| Issue not found         | Return error, no side effects |
| Issue closed            | Return error, suggest reopen  |
| Branch checkout fails   | Return error with git status  |
| Checkpoint create fails | Return error (critical)       |
| Label add fails         | Warn, continue                |

## Example

**Input:**

```json
{
  "issue_number": 8
}
```

**Output:**

```json
{
  "workflow_id": "workflow-8-1736500000000-abc123",
  "branch": "feat/8-mcp-server-stdio-transport",
  "issue": {
    "number": 8,
    "title": "feat(mcp-server): Server startup with stdio transport",
    "body": "## Description\n\nImplement the MCP server...",
    "labels": ["enhancement", "pkg:mcp-server"]
  },
  "resumed": false
}
```

## Output Format

After completing all steps, report:

```text
SETUP COMPLETE

Issue: #<number> - <title>
Branch: <branch>
Workflow ID: <workflow_id>
Resumed: Yes/No

Ready for next phase.
```
