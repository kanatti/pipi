# pipi

A collection of pi extensions.

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
