---
name: kb
description: Query the local knowledge base (kb) to look up personal notes, research, and documentation. Use when user asks about something that might be in their notes, or wants to look up knowledge base content.
compatibility: Requires kb CLI
---

# Knowledge Base (kb)

Local markdown vault CLI for browsing and reading personal notes.

## Discover

```bash
kb domains              # list all domains with note counts
kb tags                 # list all tags
kb notes                # list all notes (path + title)
kb notes --domain <d>   # filter by domain
kb notes --tag <t>      # filter by tag
```

## Read

```bash
kb read <path>           # read full note (e.g. lucene/search-flow.md)
kb read --outline <path> # headings only - good for large notes
```

## Workflow

1. **Orient** - run `kb domains` to see what's available
2. **Browse** - `kb notes --domain <domain>` to list relevant notes
3. **Outline first** - for large notes, `kb read --outline` before full read
4. **Read** - `kb read <path>` for the actual content

## Tips

- Paths are vault-relative with `.md` extension (e.g. `lucene/search-flow.md`)
- `01-home.md` in a domain is usually the overview/index note — start there
- Multiple domains may be relevant; check a few if the first is sparse
