# Ideas

## Permission Gate Improvements

- When Yes/No for permission gate, allow providing prompt also in return to steer.
- More compact Apply this edit? widget
- Shortcut for Allow Skip and Abort
- When edit fails, we still ask for permission.

## When to Use: Prompts vs Skills vs Extensions

**EXTENSIONS** - New capabilities pi doesn't have
- When you need to DO something bash/read/write can't easily do
- Custom tools that perform actions or complex queries
- Examples: semantic search, API calls, specialized parsers
- For QMD: Wrapping CLI commands into structured tools

**SKILLS** - Knowledge the AI loads when relevant
- Documentation and best practices you explain repeatedly
- Domain knowledge the AI wouldn't know
- System architecture and workflows
- How-to guides and reference material
- Examples: OpenSearch internals, your K8s setup, project workflows
- AI sees skill name/description in system prompt, loads full content on-demand

**PROMPTS** - Reusable workflows you trigger manually
- Things you do repeatedly with small variations
- Multi-step procedures you want templated
- Triggered explicitly with `/name`
- Can use arguments: `/research-issue 1234`
- Examples: PR reviews, experiment setup, GitHub issue research

**Rule of thumb:**
- Extension = "I need pi to be able to X"
- Skill = "I keep explaining Y to pi"
- Prompt = "I keep asking pi to do Z in the same way"

## QMD Knowledge Base Integration

### Overview
Integrate [qmd](https://github.com/tobi/qmd) - a local semantic search engine for personal knowledge bases.
- Hybrid search: BM25 + vector embeddings + LLM reranking
- All local (via node-llama-cpp with GGUF models)
- Ideal for searching notes, experiments, papers, documentation

### Use Cases
- Search `~/Documents/kanatti-notes` for past work on OpenSearch, Spark, DataFusion
- Find related experiments before starting new tests
- Retrieve research paper summaries
- Surface relevant context when debugging or researching

### Components to Build

#### 1. Extension: `extensions/qmd.ts`
Wrap qmd CLI for pi tool usage:

**Tools:**
- `search_notes` - Hybrid search (BM25 + semantic + reranking)
  - Parameters: query, collection (optional), limit, minScore
  - Returns: JSON array of results with scores
- `get_note` - Retrieve full note content by path or docid
  - Parameters: path, fromLine (optional), maxLines (optional)
  - Supports docid format: `#abc123`
- `multi_get_notes` - Retrieve multiple notes by glob or list
  - Parameters: pattern (glob like `experiments/2025-*.md`), maxBytesPerFile
  - Returns: JSON array of note contents

**Implementation notes:**
- Use `context.bash()` to execute qmd commands
- Parse JSON output for structured responses
- Handle errors gracefully (qmd not installed, collection not found)

#### 2. Skill: `skills/kanatti-knowledge/SKILL.md`
Teach pi about personal knowledge base structure:

```markdown
---
name: kanatti-knowledge
description: Search and retrieve from Kanatti's personal notes on OpenSearch, Spark, DataFusion, K8s, AWS. Use for questions about past work or research.
---

# Kanatti Knowledge Base

## Collections
- `notes`: Personal technical notes
- `experiments`: Test results and performance tests
- `papers`: Research paper summaries
- `workflows`: Process documentation

## Search Usage
- Quick keyword: `qmd search "query"`
- Semantic: `qmd vsearch "how does X work"`
- Hybrid (best): `qmd query "topic" --json -n 10`

## For Agent Context
- Get structured results: `--json`
- Filter by score: `--min-score 0.4`
- Get all matches: `--all --files`
- Retrieve full content: `qmd get "path.md" --full`

## Search Patterns
- By collection: `-c experiments`
- By topic: Use natural language
- By docid: `qmd get "#abc123"`
```

#### 3. Prompt Templates

**`prompts/research.md`** - Research with knowledge base context
```markdown
---
description: Research a topic using knowledge base and external sources
---
Research $@:
1. Search my notes for related past work (use search_notes)
2. Read relevant notes fully
3. Search GitHub issues if applicable
4. Summarize: what I know vs what's new
5. Create new note in ~/Documents/kanatti-notes/ with findings
```

**`prompts/experiment-review.md`** - Review past experiments
```markdown
---
description: Review past experiments on a topic
---
Review my past experiments on $@:
1. Search experiments collection: search_notes("$@", collection="experiments")
2. Get full content of top matches
3. Summarize: what worked, what didn't, key learnings
4. Suggest next steps based on past attempts
```

**`prompts/research-issue.md`** - Deep dive into GitHub issue with context
```markdown
---
description: Research GitHub issue with knowledge base context
---
Research GitHub issue $1:
1. Read issue and all comments (use gh)
2. Search my notes for related work
3. Check related PRs and commits
4. Compare issue to my past experience
5. Summarize problem, proposed solutions, status
6. Suggest investigation approach based on my past work
```

### Setup Instructions

#### Initial QMD Setup
```bash
# Install qmd
bun install -g github:tobi/qmd

# Index notes
cd ~/Documents/kanatti-notes
qmd collection add . --name notes
qmd collection add experiments --name experiments
qmd collection add papers --name papers
qmd collection add workflows --name workflows

# Add context descriptions
qmd context add qmd://notes "Personal technical notes on OpenSearch, Spark, DataFusion, K8s, AWS"
qmd context add qmd://experiments "Experiment results and performance tests"
qmd context add qmd://papers "Research paper summaries and analysis"
qmd context add qmd://workflows "Standard workflows and procedures"

# Generate embeddings (downloads ~2GB of models first time)
qmd embed

# Verify
qmd status
qmd search "test query"
```

#### Add to pipi
```bash
cd ~/Code/pipi

# Create extension
# (Create extensions/qmd.ts)

# Create skill
mkdir -p skills/kanatti-knowledge
# (Create skills/kanatti-knowledge/SKILL.md)

# Add prompts
# (Create prompts/*.md in examples/prompts/)

# Update package.json if needed to expose skills/prompts

# Test in pi
pi
/reload  # Pick up new extension
/search_notes "opensearch"  # Test extension
/research something  # Test prompt template
```

### Workflow Examples

**Debugging OpenSearch issue:**
```
You: "Help me debug this OpenSearch query timeout"

Pi automatically:
1. Loads kanatti-knowledge skill (sees "OpenSearch")
2. Calls search_notes("opensearch query timeout")
3. Finds past notes on query optimization
4. Uses context to help debug
```

**Starting new experiment:**
```
You: "Test Spark partition strategies"

Pi:
1. Searches experiments for past Spark tests
2. Reviews what was already tried
3. Suggests new approach avoiding past mistakes
4. Creates experiment template
```

**Researching GitHub issue:**
```
You: /research-issue elastic/opensearch#1234

Pi:
1. Fetches issue details
2. Searches notes for related work
3. Compares to past knowledge
4. Suggests investigation approach
```

### Technical Notes

**QMD Architecture:**
- SQLite FTS5 (BM25) + sqlite-vec (embeddings)
- 3 local GGUF models (~2GB total):
  - embeddinggemma-300M (embeddings)
  - qwen3-reranker-0.6b (reranking)
  - qmd-query-expansion-1.7B (query expansion)
- Query flow: Original query + LLM expansions → parallel BM25+vector → RRF fusion → LLM reranking → position-aware blending

**Score interpretation:**
- 0.8-1.0: Highly relevant
- 0.5-0.8: Moderately relevant
- 0.2-0.5: Somewhat relevant
- 0.0-0.2: Low relevance

**Index location:** `~/.cache/qmd/index.sqlite`

### Future Ideas

- MCP server integration if pi supports it (qmd has built-in MCP server)
- Auto-update index on note changes (watch filesystem)
- Skill for specific domains (opensearch-knowledge, spark-knowledge, k8s-knowledge)
- Integration with session saving (save relevant notes with session)
- Extension to create notes in correct location with templates

## Repository-Specific Shortcuts

### Problem
Working across a few specific repos frequently (elastic/opensearch, apache/spark, etc.)
- Repeatedly explaining architecture and workflows
- Same operations per repo (PR reviews, testing, deployment)
- Each repo has quirks and gotchas

### Approach Options

#### Option 1: Repo-Specific Skills (Best for knowledge)
Create skill per major repo documenting:
- Architecture (key directories, where things live)
- Common operations (build, test, deploy commands)
- Known issues (flaky tests, gotchas, quirks)
- Work areas and focus

```markdown
skills/opensearch-repo/SKILL.md
---
name: opensearch-repo
description: OpenSearch repository architecture, operations, testing, PR workflow
---
```

**Benefit:** Pi auto-loads when repo is mentioned, provides context automatically

#### Option 2: Repo-Aware Prompts (Best for workflows)
Templates for common per-repo tasks:
- `/pr-opensearch 1234` - Review OpenSearch PR
- `/issue-spark 567` - Research Spark issue
- `/test-[repo]` - Run standard test suite

**Benefit:** Consistent workflow, uses repo-specific skill for context

#### Option 3: Extension with Shortcuts (Best for complex operations)
Tool that wraps multi-step operations:
- Fetch PR + checkout + run checks + analyze
- Issue research with commit history
- Performance test setup

**Benefit:** Encapsulates complex sequences

### Recommended: Combination
1. **One skill per major repo** - Knowledge and context
2. **Prompt templates** - Common workflows (`/pr-[repo]`, `/issue-[repo]`)
3. **Extension (optional)** - Complex multi-step operations

### TODO: Fill in specifics
Need to document per repo:
- Which repos? (elastic/opensearch, apache/spark, ...)
- What operations are most common? (PR reviews, bug hunting, testing)
- What's repetitive? (same commands, same checklists)
- Repo-specific quirks and gotchas
- Testing procedures
- Deployment workflows

**Action:** Come back to this while working, document actual repos and workflows

## Sandboxing & Isolation Tools to Explore

### Gondolin - Local Linux Micro-VMs

**Repo:** https://github.com/earendil-works/gondolin

**What it is:**
- Local Linux micro-VMs (QEMU) with fully programmable network stack and filesystem
- Designed for sandboxing AI agent-generated code
- Boot times in seconds
- TypeScript control plane

**Key Features:**
- **Network control:** Allowlist hosts, inject secrets at network layer (guest never sees real API keys)
- **Programmable filesystem:** In-memory, read-only, or custom providers (can proxy to remote storage)
- **Secrets protection:** Credentials injected by host only for approved hosts, prevents exfiltration
- **Cross-platform:** macOS (Apple Silicon) and Linux (aarch64)

**Example:**
```ts
const { httpHooks, env } = createHttpHooks({
  allowedHosts: ["api.openai.com"],
  secrets: { OPENAI_API_KEY: { hosts: ["api.openai.com"], value: key } },
});
const vm = await VM.create({ httpHooks, env });
await vm.exec("curl -H \"Authorization: Bearer $OPENAI_API_KEY\" https://...");
```

**Use Cases for Me:**
- Run untrusted code from agents safely
- Test OpenSearch/Spark code in isolated environments
- Experiment with network restrictions (block internal IPs, allowlist specific hosts)
- Protect AWS credentials when agents run cloud CLI commands
- Quick spin-up/tear-down for experiments (better than Docker for agent workflows?)

**Integration with Pi:**
- Extension to spin up Gondolin VM for risky operations
- Skill documenting when to use sandboxing
- Prompt template: `/sandbox "run this code"` - executes in Gondolin VM
- Could replace direct bash execution for untrusted code

**Questions to explore:**
- Performance vs Docker for quick experiments?
- How to handle K8s interactions from sandbox?
- Integration with qmd (mount notes read-only in VM)?
- Custom images with OpenSearch/Spark pre-installed?

---

### AgentFS - Filesystem for Agents

**Repo:** https://github.com/tursodatabase/agentfs

**What it is:**
- SQLite-based filesystem designed for AI agents
- All operations recorded in single DB file
- CLI + SDKs (TypeScript, Python, Rust)
- FUSE (Linux) / NFS (macOS) mounting

**Key Features:**
- **Auditability:** Every file operation, tool call, state change recorded
- **Reproducibility:** Snapshot/restore agent state with `cp agent.db snapshot.db`
- **Portability:** Single SQLite file, version-controllable
- **Tool tracking:** Records tool calls with status, duration, timestamps
- **Timeline queries:** SQL queries for agent history/behavior

**Example:**
```bash
agentfs init my-agent
agentfs fs write my-agent /output/report.txt "content"
agentfs timeline my-agent  # View action history
agentfs mount my-agent ./mnt  # Mount to host filesystem
```

**Use Cases for Me:**
- **Experiment tracking:** Each experiment gets an AgentFS instance
  - All file operations recorded
  - Timeline of what agent did
  - Snapshot before/after for comparison
- **Debugging agent behavior:** Query SQLite to see exact sequence of operations
- **Reproducible research:** Share entire experiment as single .db file
- **Session continuation:** AgentFS snapshot = session state
- **Audit trail:** What files did the agent read/write during research?

**Integration with Pi:**
- Extension wrapping AgentFS SDK
  - `agent_fs_init` - Create new agent filesystem
  - `agent_fs_snapshot` - Snapshot current state
  - `agent_fs_timeline` - Query operation history
- Skill teaching pi when to use AgentFS for experiments
- Integration with sessions extension:
  - Save session = snapshot AgentFS + continuation prompt
  - Resume session = restore AgentFS snapshot + load context
- Integration with experiment workflows:
  - `/experiment "test Spark partitions"` → creates AgentFS, runs, saves snapshot

**Potential Workflow:**
```bash
# Start experiment
/experiment "test opensearch query performance"
  → Creates AgentFS instance: experiments/opensearch-query-perf.db
  → Mounts at /agent
  → Agent writes test code, results, logs to /agent/
  → Records all operations

# Later: review what happened
agentfs timeline experiments/opensearch-query-perf.db
agentfs fs ls experiments/opensearch-query-perf.db

# Compare two experiment runs
cp experiments/opensearch-v1.db snapshot-v1.db
cp experiments/opensearch-v2.db snapshot-v2.db
# Query differences in SQL
```

**Questions to explore:**
- Can AgentFS mount be nested in Gondolin VM?
- Performance impact of FUSE/NFS vs direct filesystem?
- How to integrate with qmd (index AgentFS contents)?
- Tool call tracking schema - can we extend for custom metrics?

---

### Combined Workflow: Gondolin + AgentFS + QMD

**Scenario:** Research OpenSearch optimization, test in sandbox, track everything

1. **Context gathering:**
   - QMD searches notes for past OpenSearch work
   - Loads opensearch-repo skill for context

2. **Sandboxed execution:**
   - Gondolin VM spins up with OpenSearch pre-installed
   - AgentFS mounted at `/agent` inside VM
   - Network restricted to necessary hosts only
   - AWS creds injected at network layer (never visible in VM)

3. **Experiment tracking:**
   - All operations recorded in AgentFS
   - Test code, results, logs written to `/agent/`
   - Timeline captures sequence of operations

4. **Results:**
   - AgentFS snapshot saved to `experiments/opensearch-optimization-2025-02-05.db`
   - Summary written to `~/Documents/kanatti-notes/experiments/`
   - QMD indexes the new note for future searches

**Action:** Experiment with both tools, design integration points
