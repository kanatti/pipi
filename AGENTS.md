# AGENTS.md

## What is pi?

Pi is a coding agent that uses LLMs to read files, execute commands, and modify code. It's extensible via TypeScript extensions, reusable prompt templates, and skills.

## What is pipi?

Pipi is a pi package containing custom extensions, skills, and prompts for specific workflows.

## Package Structure

### `prompts/`
Reusable prompt templates invoked with `/name` in the editor. Examples:
- `/plan` - plan work with structured thinking
- `/discuss` - collaborative discussion mode
- `/get-ready` - prepare context before starting work

### `skills/`
Specialized capabilities that load on-demand when needed. Examples:
- `yt-analyze` - analyze YouTube videos via transcripts
- `refer-kbase` - query local knowledge base
- `repo-discovery` - find available repositories

### `extensions/`
TypeScript modules that add tools, commands, and event handlers to pi:
- `permission-gate.ts` - confirm dangerous bash commands
- `checkpoints.ts` - save/restore session checkpoints
- `handoff.ts` - handoff context between agents
- `whimsical.ts` - create Whimsical diagrams

### `docs/`
Technical documentation and implementation notes for this package's features.

### `plan/`
Planning documents and proposals for future work.

### `research/`
Analysis and technical investigations exploring how systems work and implementation approaches. Prefer this over `/tmp` for documenting research.

### `.pi/`
Meta-configuration for working on pipi itself:
- `.pi/prompts/` - prompts for developing pipi (like `/permit` to add safe commands)
- `.pi/skills/` - skills for pi package development reference

See README.md for installation and usage.
