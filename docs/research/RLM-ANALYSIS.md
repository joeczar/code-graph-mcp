# Recursive Language Models (RLMs) - Research Analysis

> Research conducted January 2026. Informs design decisions for code-graph-mcp.

## Executive Summary

Recursive Language Models (RLMs) are an inference-time scaffolding approach that lets LLMs handle contexts up to 10M+ tokens by programmatically exploring text rather than stuffing it into context. While RLMs solve "context rot" within sessions, they don't address cross-session persistence—our unique value.

**Key decision**: Keep code-graph-mcp focused on persistent structure. Don't incorporate RLM capabilities. MCP composition handles integration naturally.

---

## What Are RLMs?

### Origin

Introduced by MIT researchers (Alex Zhang, Tim Kraska, Omar Khattab) in late 2025. Paper: [arXiv:2512.24601](https://arxiv.org/abs/2512.24601).

### The Problem They Solve

LLMs suffer from **context rot**: performance degrades as context length increases, even within advertised context windows. Simply making windows larger doesn't fix this.

### How They Work

```
┌─────────────────────────────────────────────────────────────┐
│                     USER QUERY                               │
│            "Find all security vulnerabilities"               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ROOT LLM                                  │
│  • Receives: query + system prompt (how to use REPL)        │
│  • Does NOT receive: the actual context/codebase            │
│  • Outputs: Python code to explore + final answer           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   PYTHON REPL                                │
│                                                              │
│  Available:                                                  │
│  • `context` - string variable (your 10MB codebase)         │
│  • `llm_query(prompt, context_slice)` - spawn sub-LLM       │
│  • `print()` - see intermediate results                     │
│  • Standard Python (regex, slicing, loops)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUB-LLM CALLS                              │
│  • Fresh context window (not polluted by exploration)       │
│  • Handles ~500K chars each                                 │
│  • Returns results to REPL variables                        │
│  • Currently: depth=1 only (sub-LLMs can't spawn more)     │
└─────────────────────────────────────────────────────────────┘
```

### Emergent Strategies

Models naturally develop these patterns without explicit instruction:

| Strategy | Description | Example |
|----------|-------------|---------|
| **Grepping** | Regex to narrow search space | `re.findall(r'def.*auth', context)` |
| **Peeking** | Inspect structure before full analysis | `context[:1000]` |
| **Partitioning** | Split into uniform chunks | `[context[i:i+100000] for i in range(...)]` |
| **Semantic chunking** | Split by logical boundaries | By file, by function |
| **Verification** | Sub-LLM double-checks answers | Redundant validation calls |
| **Variable stitching** | Store results, combine programmatically | Build long outputs in pieces |

---

## Benchmark Results

From the paper:

| Task | Context Size | RLM Performance | vs Baseline |
|------|--------------|-----------------|-------------|
| **OOLONG** (long-context reasoning) | 131K tokens | 56.5% (GPT-5) | +34 points over base |
| **BrowseComp+** (document retrieval) | 6-11M tokens | 91.3% | Base models ~0% |
| **CodeQA** | 23K-4.2M | 62% | Base models fail |

**Key finding**: Base models score near-zero on information-dense long tasks. RLMs make them functional.

### Cost Analysis

| Aspect | Finding |
|--------|---------|
| Median cost | Cheaper than stuffing context into baseline |
| vs Summarization | 3x cheaper while performing better |
| Variance | High - simple tasks cheap, complex tasks expensive |
| Scaling | Constant, linear, or quadratic depending on task |

---

## Current Limitations

From the paper:

1. **Sub-call inefficiency** - Qwen3-Coder made thousands of calls for simple tasks; GPT-5 made ~10
2. **Sequential execution** - All sub-LLM calls block; async would help
3. **Depth limited to 1** - Sub-LLMs can't spawn their own sub-LLMs
4. **Untrained** - Inference-time scaffolding, not learned behaviors
5. **Worse on short context** - RLMs underperform base models when context fits natively

---

## Prime Intellect's RLMEnv

Prime Intellect is extending the MIT work with:

### Key Changes

1. **Tools beyond REPL** - Available only to sub-LLMs (keeps root context clean)
2. **Answer via environment variable** - Clear completion signal

### Training Vision

```
Current: Inference-time scaffolding (clever prompting)
Future:  RL-trained RLM (model learns optimal chunking/recursion policies)
```

They believe RL-trained RLMs will enable "agents solving long-horizon tasks spanning weeks to months."

### The "Bitter Lesson" Alignment

Prime Intellect explicitly invokes Rich Sutton's "Bitter Lesson": hand-crafted structure consistently loses to letting models figure things out with more compute.

RLMs let models discover structure dynamically rather than imposing predetermined schema.

---

## Comparison: RLMs vs Code Graph

### Problem Space

| Aspect | RLMs Solve | Code Graph Solves |
|--------|------------|-------------------|
| **Core issue** | Context rot (performance degrades as context grows) | Amnesia (knowledge lost on compaction/session end) |
| **Timeframe** | Within a single session | Across sessions |
| **Mechanism** | Dynamic context chunking at inference time | Persistent structured knowledge graph |

### Trade-offs

| Aspect | RLM (REPL) | Code Graph |
|--------|------------|------------|
| Setup cost | Zero | Parse entire codebase |
| Query types | Unlimited (any Python) | Fixed (schema-defined) |
| Staleness | Never (reads current files) | Yes (needs re-parse) |
| Speed for known queries | Slow (re-discovers) | Fast (pre-computed) |
| Novel questions | Yes | No |
| Token efficiency for known patterns | Low | High |
| **Persistence** | **None** | **Full** |

### The Key Insight

RLMs are powerful for exploration, but when the session ends, everything discovered is gone:

- "Always check expiry before validating tokens" → gone
- "The auth refactor broke because of X" → gone
- "This pattern worked well for Y" → gone

**Cross-session persistence is orthogonal to context management.**

---

## Cursor's Dynamic Context Discovery

Cursor released "Dynamic Context Discovery" in January 2026, applying similar principles to RLMs but with a different mechanism.

### The Connection

This approach has been [noted as "rhyming with RLM thinking"](https://whynowtech.substack.com/p/recursive-language-models-rlms). Same goal (avoid context bloat), different implementation.

### Mechanism Comparison

| Aspect | RLM Approach | Cursor Approach |
|--------|--------------|-----------------|
| Storage | REPL variable | **Files** |
| Exploration | Python code | `grep`, `tail`, semantic search |
| Sub-queries | Sub-LLM calls | Agent reads files as needed |
| Primitive | Code execution | Filesystem operations |

### Five Techniques

From [Cursor's blog](https://cursor.com/blog/dynamic-context-discovery):

1. **Tool outputs → files** - Long results written to files; agent uses `tail`/`grep` instead of truncating
2. **Chat history → files** - Full history preserved for recovery after summarization
3. **Agent skills** - Only names loaded statically; details fetched on-demand via grep/semantic search
4. **MCP tools → folders** - Synced to filesystem, not loaded upfront (**46.9% token reduction** in A/B tests)
5. **Terminal sessions → files** - Grep-able instead of copy-pasted into context

### Conversation History Management

This is notable: Cursor **does** manage conversation history dynamically.

> "When context windows fill, Cursor triggers summarization. To prevent knowledge degradation from this 'lossy compression,' the system provides agents with **history files they can search to recover missing task details**."

So when your conversation gets summarized (lossy), the full history remains in a file. The agent can grep it to recover what was lost during summarization.

### The Pattern

**Files as the universal primitive.** Everything goes to files. Agent searches files. Simple, powerful, no fancy abstractions.

### Results

- 46.9% token reduction for MCP tool calls (statistically significant)
- Avoids "unnecessary summarizations when reaching context limits"
- Enables recovery of information lost during context compression

### Implications for Code Graph

1. **Files are the integration point** - If Cursor writes context to files, our graph could be another "searchable resource" they access

2. **Complementary approaches** - Cursor manages dynamic retrieval; we provide pre-computed structure and cross-session persistence

3. **They still have the persistence problem** - Chat history files help *within* a session, but what about *across* sessions? Starting a new chat loses that history. That's still our territory.

4. **Potential integration path** - Could expose graph queries as files that Cursor's agent can grep/search

### Sources

- [Cursor Blog: Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery)
- [InfoQ: Cursor Introduces Dynamic Context Discovery](https://www.infoq.com/news/2026/01/cursor-dynamic-context-discovery/)
- [WhyNow Tech: RLMs and Cursor Comparison](https://whynowtech.substack.com/p/recursive-language-models-rlms)

---

## Design Implications for Code Graph

### What We Should Do

1. **Stay focused on persistence** - Our moat is cross-session memory, not context management

2. **Maximize callability** - Design queries to be useful to ANY orchestration approach:
   - Native Claude
   - RLM scaffolds
   - Future paradigms we haven't seen yet

3. **Accept schema limitations** - The graph can only answer anticipated questions. That's okay—it's fast for those questions.

4. **Don't incorporate RLM** - MCP provides composition. Users can run both servers.

### What We Shouldn't Do

1. **Don't build a REPL sandbox** - That's RLM's job
2. **Don't try to handle novel queries** - Let the model explore raw code for those
3. **Don't over-engineer the schema** - More relationship types won't match RLM's flexibility

### Future Consideration

**Graph-guided exploration**: Could we provide hints for where to explore?

```python
# Hypothetical
relevant_files = graph.suggest_files("authentication bug")
# RLM then focuses exploration there
```

This bridges structured queries and flexible exploration without coupling implementations.

---

## Sources

- [arXiv Paper](https://arxiv.org/abs/2512.24601)
- [arXiv HTML Version](https://arxiv.org/html/2512.24601v1)
- [Prime Intellect Blog](https://www.primeintellect.ai/blog/rlm)
- [Alex Zhang's Blog](https://alexzhang13.github.io/blog/2025/rlm/)
- [GitHub Implementation](https://github.com/alexzhang13/rlm)

---

*Research conducted January 2026. Update as the field evolves.*
