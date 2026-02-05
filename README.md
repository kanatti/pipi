# pipi

A collection of pi extensions.

## Extensions

- **permission-gate** — Allows `read` freely, confirms everything else (bash, write, edit, etc.)
- **sessions** — Save and continue sessions with AI-generated continuation prompts
    - `/sessions save <name>` — Pick a prompt template, generate continuation from current session
    - `/sessions continue [name]` — Load a saved session (shows picker if no name)
    - `/sessions list` — List all saved sessions
    - `/sessions delete <name>` — Delete a saved session

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

### Session Continuation Prompts

Add your own prompts to `~/.pipi/prompts/`. Example prompts are in `examples/prompts/`:

- `default.md` — General purpose continuation
- `learning.md` — For technical walkthroughs and learning sessions

Copy them to your prompts directory and customize as needed:

```bash
mkdir -p ~/.pipi/prompts
cp examples/prompts/*.md ~/.pipi/prompts/
```

Saved sessions are stored in `~/.pipi/sessions/<name>.md`.
