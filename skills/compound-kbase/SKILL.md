---
name: compound-kbase
description: Help user improve and update their local knowledge base (kbase) documentation. Get vault location, understand structure, and make changes based on user's explicit instructions.
---

# compound-kbase

This skill enables you to help the user improve and update their local knowledge base (kbase) documentation.

## Finding Vault Location

1. Run `kbase vaults` to see all configured vaults and their paths
2. Identify the vault the user wants to work with (or use active vault)
3. Use the absolute path from vault config to access files

Example vault output:
```
Active: personal
Vaults:
  personal: /Users/you/Documents/personal-notes
  work: /Users/you/Documents/work-notes
```

## Workflow

**Never autonomously update.** Always:

1. **Understand the current state**: Use `kbase domains`, `kbase notes`, `kbase read` to explore
2. **Ask the user**: What specifically they want to change/improve
3. **Make changes**: Based on their explicit instructions, use `edit` or `write` tools on vault files
4. **Confirm**: Show what you changed

## Understanding Structure

- Vault root contains domain folders (top-level directories)
- Each domain contains `.md` note files
- Paths are `<vault-path>/<domain>/<note>.md` or `<vault-path>/<note>.md`
- Use `kbase notes --files` to get all note paths, then prepend vault path

## Common Update Scenarios

**Add new note**: 
- Ask: domain, filename, initial content
- Write: `<vault-path>/<domain>/<filename>.md`

**Update existing note**:
- Read current content with `kbase read <path>`
- Ask: what to change
- Edit: Use vault path + note path

**Reorganize**:
- Ask: what structure they want
- Use bash `mv`, `mkdir` in vault directory

**Add domain**:
- Ask: domain name, description
- Create: `<vault-path>/<domain>/` directory
- Optionally: `01-home.md`, `_description.md`

## Example

User: "I want to improve my elasticsearch notes"

1. Get vault: `kbase vaults` → `/Users/you/notes`
2. Explore: `kbase notes --domain elasticsearch`
3. Ask: "What would you like to improve? Options:
   - Add new notes
   - Update existing notes (which ones?)
   - Reorganize structure
   - Add tags or cross-references"
4. Based on response, make changes to files in `/Users/you/notes/elasticsearch/`

## Notes

- Always use full vault path from `kbase vaults`, not relative paths
- Remember: domains are just directories, notes are just markdown files
- Tag index rebuilds automatically when user runs `kbase index`
