# Batch Set Dependencies

Sets up multiple dependency relationships at once.

## Usage

When an agent needs to set multiple dependencies, iterate over pairs:

```bash
# For each blocked:blocking pair
BLOCKED_ID=$(gh issue view <blocked> --json id -q .id)
BLOCKING_ID=$(gh issue view <blocking> --json id -q .id)

gh api graphql -f query="
mutation {
  addBlockedBy(input: {
    issueId: \"$BLOCKED_ID\",
    blockingIssueId: \"$BLOCKING_ID\"
  }) {
    issue { number }
  }
}"
```

## Example

Set up: #11 blocked by #10, and #10 blocked by #12, #13, #14:

```bash
# #11 blocked by #10
BLOCKED_ID=$(gh issue view 11 --json id -q .id)
BLOCKING_ID=$(gh issue view 10 --json id -q .id)
gh api graphql -f query="mutation { addBlockedBy(input: { issueId: \"$BLOCKED_ID\", blockingIssueId: \"$BLOCKING_ID\" }) { issue { number } } }"

# #10 blocked by #12
BLOCKED_ID=$(gh issue view 10 --json id -q .id)
for blocking in 12 13 14; do
  BLOCKING_ID=$(gh issue view $blocking --json id -q .id)
  gh api graphql -f query="mutation { addBlockedBy(input: { issueId: \"$BLOCKED_ID\", blockingIssueId: \"$BLOCKING_ID\" }) { issue { number } } }"
  echo "✓ #10 blocked by #$blocking"
done
```

## Notes

- Get node IDs first with `gh issue view <num> --json id -q .id`
- Each mutation creates one dependency relationship
- Dependencies auto-clear when blocking issue closes
