# Add Issue Dependency

Adds a native GitHub dependency relationship between two issues.

## Usage

When an agent needs to add a dependency, execute:

```bash
# Get the node IDs
BLOCKED_ID=$(gh issue view <blocked-issue> --json id -q .id)
BLOCKING_ID=$(gh issue view <blocking-issue> --json id -q .id)

# Create the dependency
gh api graphql -f query="
mutation {
  addBlockedBy(input: {
    issueId: \"$BLOCKED_ID\",
    blockingIssueId: \"$BLOCKING_ID\"
  }) {
    issue { number }
    blockingIssue { number }
  }
}"
```

## Example

To make issue #11 blocked by issue #10:

```bash
BLOCKED_ID=$(gh issue view 11 --json id -q .id)
BLOCKING_ID=$(gh issue view 10 --json id -q .id)

gh api graphql -f query="
mutation {
  addBlockedBy(input: {
    issueId: \"$BLOCKED_ID\",
    blockingIssueId: \"$BLOCKING_ID\"
  }) {
    issue { number }
    blockingIssue { number }
  }
}"
```

## Notes

- Creates native GitHub dependency (shows "Blocked" in UI)
- Automatically cleared when blocking issue closes
- Same repository only; max 50 dependencies per issue
