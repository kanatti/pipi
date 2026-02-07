---
name: pi-skill-dev
description: Reference for creating and modifying skills - frontmatter format, structure, SKILL.md requirements, and best practices. Use when creating new skills or fixing skill validation issues.
---

# Pi Skill Development

Reference for creating skills (like yt-analyze).

## What is a Skill?

A skill is a self-contained capability package that the agent loads on-demand. It provides specialized workflows, setup instructions, helper scripts, and reference documentation for specific tasks.

## Skill Structure

A skill is a directory with a `SKILL.md` file:

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Optional: helper scripts
│   └── process.sh
├── references/           # Optional: detailed docs
│   └── api-reference.md
└── assets/               # Optional
    └── template.json
```

## SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does and when to use it. Be specific.
---

# My Skill

## Setup (if needed)

Run once before first use:
\`\`\`bash
cd /path/to/skill && npm install
\`\`\`

## Usage

\`\`\`bash
./scripts/process.sh <input>
\`\`\`

Use relative paths from skill directory for references:
See [the reference guide](references/REFERENCE.md) for details.
```

## Frontmatter (Required)

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | 1-64 chars. Lowercase a-z, 0-9, hyphens. Must match parent directory. |
| `description` | **Yes** | Max 1024 chars. What the skill does and when to use it. |
| `license` | No | License name or reference to bundled file. |
| `compatibility` | No | Max 500 chars. Environment requirements (e.g., "Requires ktools"). |
| `metadata` | No | Arbitrary key-value mapping. |
| `allowed-tools` | No | Space-delimited list of pre-approved tools (experimental). |
| `disable-model-invocation` | No | When `true`, skill is hidden from system prompt. Users must use `/skill:name`. |

### Name Rules

**Valid names:**
- `pdf-processing`
- `data-analysis`
- `code-review`

**Invalid names:**
- `PDF-Processing` (uppercase)
- `-pdf` (leading hyphen)
- `pdf--processing` (consecutive hyphens)
- `pdf_processing` (underscore)

**Must match parent directory name exactly.**

### Description Best Practices

The description determines when the agent loads the skill. **Be specific about WHEN to use it.**

**Good:**
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents.
```

**Poor:**
```yaml
description: Helps with PDFs.
```

Include:
- What the skill does (capabilities)
- When to use it (triggers)
- What types of inputs it handles

## How Skills Work

1. **At startup**, pi scans skill locations and extracts names and descriptions
2. **System prompt** includes available skills in XML format
3. **When a task matches**, the agent uses `read` to load the full SKILL.md
4. **The agent follows** the instructions, using relative paths to reference scripts and assets

This is **progressive disclosure**: only descriptions are always in context, full instructions load on-demand.

## Skill Locations

Skills are loaded from:

- **Global**: `~/.pi/agent/skills/`
- **Project**: `.pi/skills/`
- **Packages**: `skills/` directories or `pi.skills` entries in `package.json`
- **Settings**: `skills` array with files or directories
- **CLI**: `--skill <path>` (repeatable, additive even with `--no-skills`)

**Discovery rules:**
- Direct `.md` files in the skills directory root
- Recursive `SKILL.md` files under subdirectories

## Validation

Pi validates skills against the Agent Skills standard. Most issues produce warnings but still load the skill:

- Name doesn't match parent directory
- Name exceeds 64 characters or contains invalid characters
- Name starts/ends with hyphen or has consecutive hyphens
- Description exceeds 1024 characters

**Exception**: Skills with missing `description` are **not loaded**.

## Skill Commands

Skills register as `/skill:name` commands:

```bash
/skill:brave-search           # Load and execute the skill
/skill:pdf-tools extract      # Load skill with arguments
```

Arguments after the command are appended to the skill content as `User: <args>`.

## Example: Complete Skill

```
yt-analyze/
└── SKILL.md
```

**SKILL.md:**
```markdown
---
name: yt-analyze
description: Analyzes YouTube videos by fetching transcripts and providing summaries, insights, and answering questions about video content. Use when user asks to analyze, summarize, or understand YouTube videos.
compatibility: Requires ktools
---

# YouTube Video Analyzer

Analyzes YouTube videos by fetching chapters and transcripts.

## When to Use

- User asks to analyze, summarize, or understand a YouTube video
- User has questions about video content
- User wants key points without watching

## Workflow

### 1. Extract Video ID

From URL: `https://www.youtube.com/watch?v=VIDEO_ID`

### 2. Check Availability

\`\`\`bash
ktools yt-transcript list <video_id>
ktools yt-transcript chapters <video_id>
\`\`\`

### 3. Fetch Transcript

\`\`\`bash
mkdir -p ~/.tools/scratch
ktools yt-transcript get <video_id> --output ~/.tools/scratch/yt-<video_id>.txt
\`\`\`

### 4. Analyze Content

Read the transcript and provide summary with timestamps.
```

## Tips

- **Descriptions matter** - They determine when the skill is loaded
- **Use relative paths** - For scripts and references
- **Keep it focused** - One skill = one capability
- **Test the description** - Would an agent know when to use this?
- **Include examples** - Show concrete usage patterns
- **Document dependencies** - Use `compatibility` field
- **Use `disable-model-invocation`** - For reference-only skills (rare)

## Common Patterns

### Skill with Scripts

```
git-history/
├── SKILL.md
└── scripts/
    └── git-find-commit
```

Reference scripts with relative paths:
```bash
./scripts/git-find-commit "search term"
```

### Skill with References

```
api-skill/
├── SKILL.md
└── references/
    └── api-reference.md
```

Link to references:
```markdown
See [API Reference](references/api-reference.md) for details.
```

### Skill with Setup

```markdown
## Setup

Run once before first use:
\`\`\`bash
cd /path/to/skill && npm install
\`\`\`
```

## Related Skills

- **pi-extension-dev** - Creating extensions (tools, events, UI)
- **pi-package-dev** - Package structure and manifest

## Full Documentation

`~/Code/pi-mono/packages/coding-agent/docs/skills.md`
