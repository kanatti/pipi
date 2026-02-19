---
name: github-read
description: Fetches a file from a GitHub URL using raw.githubusercontent.com and saves it locally under .scratch/github/. Use when user provides a GitHub file link and wants to read or analyze its contents.
---

# GitHub File Reader

Fetches a single file from GitHub via raw URL and caches it locally.

## URL Transformation

```
https://github.com/{owner}/{repo}/blob/{branch}/{path}
→ raw:  https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
→ local: .scratch/github/{owner}/{repo}/{branch}/{path}
```

## Workflow

### 1. Parse the URL

Extract parts from the GitHub URL:
- Remove `https://github.com/`
- Strip `/blob/` segment to get: `{owner}/{repo}/{branch}/{path}`

### 2. Fetch and Save

```bash
URL="https://github.com/owner/repo/blob/main/src/file.ts"
RAW_PATH="${URL#https://github.com/}"           # owner/repo/blob/main/src/file.ts
RAW_PATH="${RAW_PATH/\/blob\//\/}"              # owner/repo/main/src/file.ts
RAW_URL="https://raw.githubusercontent.com/$RAW_PATH"
LOCAL="$(pwd)/.scratch/github/$RAW_PATH"
mkdir -p "$(dirname "$LOCAL")"
curl -sL "$RAW_URL" -o "$LOCAL"
```

### 3. Read the File

Use the `read` tool on the saved local path.

## Notes

- If file already exists locally, skip the download and read directly
- For `https://github.com/{owner}/{repo}` (no file path), inform the user this skill handles single files only, not whole repos
- Line anchors like `#L10-L30` in the URL can be ignored for the download; mention the relevant line range when reading
