---
name: refer-kbase
description: Reference the user's local knowledge base (kbase) when explicitly asked. Query vaults, domains, notes, tags, and read note content based on user requests.
---

# refer-kbase

This skill enables you to access the user's local knowledge base (kbase) when they explicitly ask for it.

## Commands

```bash
kbase vaults                              # List all vaults
kbase domains [--sort name|count]         # List domains
kbase notes [--domain <d>] [--tag <t>]    # List notes (filter by domain/tag)
kbase notes --files                       # List paths only
kbase tags [--sort name|count]            # List tags (requires kbase index)
kbase read <path>                         # Read note content
kbase read <path> --outline               # Read headings only
```

## Vault Selection

- If user mentions a specific vault: run `kbase vaults`, then use `KBASE_VAULT=<name>` for subsequent commands
- Otherwise: use default vault (no override)

## Strategy

- Browse: use `kbase domains` or `kbase tags`
- Find: use `kbase notes --domain` or `--tag` to filter
- Read: use `kbase notes` to find path, then `kbase read <path>`
- Combine commands as needed (e.g., list notes then read specific ones)

## Notes

- Tag commands require index: if error, suggest running `kbase index` or use domain filters
- Note paths are vault-relative: `domain/note.md` or `note.md`
- Use `--files` for paths only, `--outline` for structure
- Default to lists first, then read based on user interest
