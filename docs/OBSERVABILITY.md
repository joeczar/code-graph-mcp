# Code Graph MCP - Observability & Testing Strategy

## Purpose

This document defines our approach to measuring, testing, and validating code-graph-mcp. The goal is to ensure the tool is **useful**, **reliable**, and **performant** across multiple projects.

---

## Part 1: Metrics Strategy

### Why Metrics?

Without observability, we can't answer:
- Is the tool actually helping developers?
- Which features are used vs ignored?
- Is performance degrading as the graph grows?
- How does behavior differ across projects?

Metrics transform gut feelings into data-driven decisions.

### What We Measure

#### 1. Performance Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| `parse_file` latency | <500ms p95 | Tree-sitter parsing should be fast |
| `parse_directory` throughput | >10 files/sec | Bulk indexing shouldn't block workflow |
| Query latency (find, calls, etc.) | <50ms p95 | Interactive queries must feel instant |
| `blast_radius` latency | <1s for depth=5 | Impact analysis is time-sensitive |
| Database size | <100MB typical | SQLite should stay manageable |
| Memory usage | <200MB runtime | MCP server runs alongside other tools |

#### 2. Reliability Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Parse success rate | >95% | Most files should parse without errors |
| Query success rate | >99% | Tool calls shouldn't fail |
| Error rate by type | Tracked | Distinguish parse vs DB vs validation errors |
| Crash/restart count | 0 | Server should be stable |

#### 3. Usage Metrics

| Metric | Purpose |
|--------|---------|
| Tool call frequency | Which tools are actually used? |
| Query patterns | What do developers search for? |
| Top searched names | Common lookup targets |
| Project distribution | Cross-project usage comparison |
| Time-of-day patterns | When is the tool used? |

#### 4. Quality Metrics

| Metric | Purpose |
|--------|---------|
| Entity extraction accuracy | Are we finding all functions/classes? |
| Relationship accuracy | Are call graphs correct? |
| Stale data rate | How often is graph out of sync? |
| False positive rate | Results that shouldn't match |

### How We Collect Metrics

**Architecture:**
```
Tool Handler
    ↓ (wrap with timing)
Metrics Collector
    ↓ (write)
Local SQLite (per project)
    ↓ (periodic export)
Aggregated Analysis
```

**Data Schema:**
```sql
-- Every tool invocation
tool_calls (
  id, project_id, tool_name, timestamp,
  latency_ms, success, error_type,
  input_summary, output_size
)

-- Parsing operations
parse_stats (
  id, project_id, timestamp,
  files_total, files_success, files_error,
  entities_extracted, relationships_extracted,
  duration_ms
)
```

**Privacy Considerations:**
- No file contents stored in metrics
- Paths truncated to project-relative
- Input summaries sanitized (no secrets)
- Local-first: data stays on developer machine

### How We Use Metrics

| Use Case | Approach |
|----------|----------|
| Weekly review | `pnpm metrics summary --last 7d` |
| Performance regression | Compare p95 latency week-over-week |
| Feature prioritization | Tool frequency guides roadmap |
| Cross-project analysis | Compare metrics across repos |
| Debugging | Trace slow queries by timestamp |

### Success Criteria

The metrics system is successful when:

- [ ] Every tool call is logged with timing
- [ ] Weekly summaries are actionable (not just noise)
- [ ] Performance regressions are caught before release
- [ ] Feature decisions are informed by usage data
- [ ] Multi-project comparison reveals patterns

---

## Part 2: Testing Strategy

### Why We Test

Testing serves multiple purposes:

1. **Correctness**: Does the code do what it should?
2. **Regression prevention**: Don't break what works
3. **Documentation**: Tests show how code is meant to be used
4. **Confidence**: Refactor without fear
5. **Design feedback**: Hard-to-test code is often poorly designed

### What We Test

#### Layer 1: Unit Tests (Fast, Isolated)

| Component | What to Test |
|-----------|--------------|
| **Zod schemas** | Valid/invalid input handling |
| **Entity store** | CRUD operations, queries, edge cases |
| **Relationship store** | Create, query, type filtering |
| **Response formatters** | Output structure, error messages |
| **Utility functions** | `countByType`, path normalization |

**Characteristics:**
- No I/O (database mocked or in-memory)
- <10ms per test
- Hundreds of tests, run on every save

#### Layer 2: Integration Tests (Realistic, Slower)

| Component | What to Test |
|-----------|--------------|
| **FileProcessor** | Parse real files, store in real DB |
| **DirectoryParser** | Recursive parsing with .gitignore |
| **MCP tools** | Full request→response cycle |
| **Migrations** | Schema upgrades work correctly |

**Characteristics:**
- Real SQLite (in-memory mode)
- Real tree-sitter parsing
- Use fixture files (not mocks)
- <500ms per test

#### Layer 3: End-to-End Tests (Full System)

| Scenario | What to Test |
|----------|--------------|
| **Parse monorepo** | Index entire project, verify entity counts |
| **Query accuracy** | Known relationships return correct results |
| **Idempotency** | Re-parsing produces same state |
| **Error recovery** | Graceful handling of malformed files |

**Characteristics:**
- Real MCP protocol (stdio)
- Real filesystem
- Longer running (seconds)
- Run before release

### Test Organization

```
packages/
├── core/
│   └── src/
│       ├── db/__tests__/           # Store unit tests
│       ├── parser/__tests__/       # Parser unit tests
│       ├── graph/__tests__/        # FileProcessor integration
│       └── queries/__tests__/      # Query function tests
│
└── mcp-server/
    └── src/
        ├── tools/__tests__/        # Tool handler tests
        └── __tests__/              # Server integration tests
```

### Test Patterns

#### Pattern 1: Schema Validation Tests

```typescript
describe('inputSchema', () => {
  it('accepts valid input', () => {
    const result = schema.safeParse({ path: '/valid/path' });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('handles optional fields', () => {
    const result = schema.safeParse({ path: '/', pattern: '**/*.ts' });
    expect(result.success).toBe(true);
  });
});
```

#### Pattern 2: Database State Tests

```typescript
describe('EntityStore', () => {
  beforeEach(() => {
    db = getDatabase(); // Fresh in-memory DB
    initializeSchema(db);
  });

  afterEach(() => {
    resetDatabase(); // Clean up
  });

  it('creates and retrieves entity', () => {
    const store = createEntityStore(db);
    const created = store.create({ name: 'foo', type: 'function', ... });
    const found = store.findById(created.id);
    expect(found).toEqual(created);
  });
});
```

#### Pattern 3: Tool Handler Tests

```typescript
describe('parseFileTool', () => {
  it('parses TypeScript file successfully', async () => {
    const response = await parseFileTool.handler({
      path: FIXTURES_DIR + '/sample.ts'
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain('function');
    expect(response.content[0].text).toContain('class');
  });

  it('returns error for non-existent file', async () => {
    const response = await parseFileTool.handler({
      path: '/does/not/exist.ts'
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('not found');
  });
});
```

#### Pattern 4: Fixture-Based Tests

```
fixtures/
├── sample.ts          # TypeScript with classes, functions, methods
├── sample.rb          # Ruby with classes, modules, methods
└── test-project/      # Multi-file project structure
    ├── src/
    │   ├── main.ts
    │   └── utils.ts
    ├── ignored/       # Should be excluded
    │   └── secret.ts
    └── .gitignore
```

### What We Don't Test

- **External services**: MCP SDK internals, tree-sitter grammars
- **Generated code**: Type definitions, build outputs
- **Trivial code**: Pure passthrough, simple getters
- **UI/CLI formatting**: Visual appearance (test data, not presentation)

### Coverage Goals

| Package | Target | Rationale |
|---------|--------|-----------|
| `@code-graph/core` | >80% | Critical business logic |
| `@code-graph/mcp-server` | >70% | Tool handlers, error paths |
| `@code-graph/cli` | >50% | Command parsing, less critical |

**Coverage is a guide, not a goal.** 100% coverage of trivial code is worse than 70% coverage of critical paths.

### Test Commands

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific package
pnpm test --filter @code-graph/core

# Run in watch mode (development)
pnpm test -- --watch

# Run specific test file
pnpm test -- packages/core/src/db/__tests__/entities.test.ts
```

### When Tests Run

| Trigger | What Runs |
|---------|-----------|
| File save (watch mode) | Affected unit tests |
| Pre-commit hook | All tests |
| Pull request | All tests + coverage report |
| Release | All tests + E2E suite |

---

## Part 3: Goals & Success Criteria

### Short-Term Goals (M4 Milestone)

1. **Instrument all tools** with timing and success/failure tracking
2. **Create metrics tables** in SQLite with project_id support
3. **Build CLI summary command** for weekly analysis
4. **Support multi-project** metrics aggregation

### Medium-Term Goals

1. **Identify top 5 most useful queries** from real usage data
2. **Optimize slowest operations** based on p95 latency
3. **Detect stale data** and warn users
4. **Track feature adoption** across projects

### Long-Term Goals

1. **Predictive insights**: "This file changes often, consider refactoring"
2. **Usage-driven roadmap**: Build features developers actually want
3. **Benchmark suite**: Compare performance across releases
4. **Community metrics**: Aggregate (anonymized) usage patterns

### Definition of Done

The observability system is complete when:

- [ ] Every tool call is logged with project, timing, and outcome
- [ ] Developers can run `pnpm metrics summary` for weekly insights
- [ ] Performance regressions trigger investigation (not necessarily alerts)
- [ ] Test coverage meets targets for each package
- [ ] New features include tests before merge
- [ ] Cross-project comparison reveals actionable patterns

---

## References

- [MCP Best Practices](https://modelcontextprotocol.info/docs/best-practices/)
- [Observability Guide - Alibaba](https://www.alibabacloud.com/blog/mcp-for-observability-2-0---six-practices-for-making-good-use-of-mcp_602423)
- [Vitest Documentation](https://vitest.dev/)
- Internal: `docs/VISION.md`, `docs/ARCHITECTURE.md`
