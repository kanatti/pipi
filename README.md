# pipi

A collection of pi extensions.

## Extensions

- **permission-gate** — Allows `read` freely, confirms everything else (bash, write, edit, etc.)
- **checkpoints** — Save and continue checkpoints with AI-generated continuation prompts
    - `/checkpoints save <name>` — Pick a prompt template, generate continuation from current session
    - `/checkpoints continue [name]` — Load a saved checkpoint (shows picker if no name)
    - `/checkpoints list` — List all saved checkpoints
    - `/checkpoints delete <name>` — Delete a saved checkpoint

## Prompt Templates

- **`/codebase-walkthrough`** — Guided Socratic exploration of codebase with Q&A verification
- **`/explain-code`** — Explain code with analogies and simplified examples

## Skills

- **`/skill:yt-analyze`** — Analyze YouTube videos by fetching transcripts and providing summaries

## Prerequisites

Install pi globally:

```bash
npm install -g @mariozechner/pi-coding-agent
```

## Install

### Global (works across all projects)

```bash
pi install https://github.com/kanatti/pipi
```

### Project-local (shared with the project)

```bash
pi install -l https://github.com/kanatti/pipi
```

### From a local path (during development)

```bash
pi install /path/to/pipi
# or relative:
pi install ./pipi
```

Use `/reload` inside pi to pick up changes without restarting.

## Update

```bash
pi update
```

Updates all installed packages that aren't pinned to a specific version.

## Pin a version

```bash
pi install https://github.com/kanatti/pipi@v1
```

Pinned packages are skipped by `pi update`.

## Customization

### Checkpoint Continuation Prompts

Add your own prompts to `~/.pipi/prompts/`. Example prompts are in `examples/prompts/`:

- `default.md` — General purpose continuation
- `learning.md` — For technical walkthroughs and learning sessions

Copy them to your prompts directory and customize as needed:

```bash
mkdir -p ~/.pipi/prompts
cp examples/prompts/*.md ~/.pipi/prompts/
```

Saved checkpoints are stored in `~/.pipi/checkpoints/<name>.md`.
