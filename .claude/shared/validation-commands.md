# Validation Commands

## Quick Reference

```bash
# Full validation
pnpm validate

# Individual steps
pnpm typecheck       # TypeScript compilation check
pnpm lint            # ESLint
pnpm test            # Vitest (all tests)
pnpm test:unit       # Unit tests only
pnpm test:int        # Integration tests only
pnpm build           # Build all packages
```

## Pre-commit Checklist

Before committing, run in order:

1. **Type check** - `pnpm typecheck`
2. **Lint** - `pnpm lint` (auto-fixable: `pnpm lint --fix`)
3. **Test** - `pnpm test`
4. **Build** - `pnpm build` (ensures no build errors)

## Workspace Commands

Run in specific packages:

```bash
pnpm --filter @code-graph/core test
pnpm --filter @code-graph/mcp-server build
pnpm --filter @code-graph/cli typecheck
```

## Common Issues

### Type Errors

```bash
# See all type errors with context
pnpm typecheck 2>&1 | head -100

# Check specific file
npx tsc --noEmit path/to/file.ts
```

### Test Failures

```bash
# Run specific test file
pnpm test path/to/file.test.ts

# Run with verbose output
pnpm test --reporter=verbose

# Run matching test name
pnpm test -t "should parse classes"

# Watch mode during development
pnpm test --watch
```

### Lint Errors

```bash
# Auto-fix what's possible
pnpm lint --fix

# Check specific file
npx eslint path/to/file.ts

# Ignore specific rule for line (use sparingly)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
```

## CI Validation

The CI pipeline runs:

```yaml
- pnpm install --frozen-lockfile
- pnpm typecheck
- pnpm lint
- pnpm test
- pnpm build
```

All must pass for PR merge.

## Performance Tips

```bash
# Skip tests for quick commit (NOT recommended)
# Only use when tests are known passing
git commit --no-verify

# Run tests in parallel (default in Vitest)
pnpm test --pool=threads

# Run only changed files
pnpm test --changed
```
