---
name: repo-discovery
description: Check this FIRST when user asks about repository access, availability, or location (e.g., "do you have X code?", "where is X?", "can you access X repo?"). Lists all documented repositories and their filesystem paths.
---

# repo-discovery

**Use this skill whenever the user asks about repository access or availability.**

Discover which code repositories the user has documented and where they're located on disk.

## Commands

```bash
kbase repo list                           # List all repos with path status
kbase repo describe --name <name>         # Show description and path
kbase repo describe --name <name> --json  # JSON output (includes path for scripting)
```

## Usage

1. **List repos**: `kbase repo list` shows all documented repos
2. **Get details**: `kbase repo describe --name <name>` shows full description + path
3. **Find path**: Use JSON output and parse: `kbase repo describe --name <name> --json | jq -r '.local_path'`

## Notes

- Repos are documented in `_repos/` directory in the vault
- Paths are machine-specific (configured per user)
- "⚠ no" means path not configured yet
- "✓ yes" means path is available
