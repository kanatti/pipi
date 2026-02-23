# rust-crate-docs Skill & Script

## Problem

When working on Rust projects, agents (and humans) need to quickly reference crate documentation in text format, not HTML.

**Current pain:**
- `cargo doc --open` generates HTML (not useful for agents)
- `rusty-man` has dependency issues and doesn't install
- Manually finding and reading source in `~/.cargo/registry/` is tedious

**What we need:**
A simple command that shows crate documentation as plain text, using the exact version from the current project.

## Solution

**Skill + Script combo:**
1. `~/Code/pipi/skills/rust-crate-docs/SKILL.md` - tells agents when and how to use it
2. `~/Code/pipi/skills/rust-crate-docs/rust-docs` - executable Python script that does the work

## Use Cases

### 1. Show crate overview
```bash
$ rust-docs walkdir
# Shows top-level crate documentation from walkdir/src/lib.rs
# Includes: description, examples, main types
```

### 2. Show specific type/function
```bash
$ rust-docs walkdir::WalkDir
# Shows documentation for WalkDir struct
# Includes: struct definition, methods, examples
```

### 3. Extract just examples
```bash
$ rust-docs --examples walkdir
# Shows only example code blocks from crate docs
```

## Script Design: `rust-docs`

### Location
```
~/Code/pipi/skills/rust-crate-docs/rust-docs
```

### Usage
```bash
rust-docs <crate-name>              # show crate-level docs
rust-docs <crate-name>::<item>      # show item-specific docs (future)
rust-docs --examples <crate-name>   # extract examples only (future)
```

### Algorithm

**Step 1: Find Cargo.lock**
- Start in current directory
- Walk up parent directories until `Cargo.lock` found
- Error if not in a Rust project

**Step 2: Parse Cargo.lock**
- Parse TOML (simple enough to regex or use stdlib)
- Find entry for requested crate
- Extract exact version number

Example Cargo.lock entry:
```toml
[[package]]
name = "walkdir"
version = "2.5.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
```

**Step 3: Locate source**
- Registry path: `~/.cargo/registry/src/index.crates.io-*/`
- Crate path: `{registry-path}/{crate-name}-{version}/`
- Main docs: `{crate-path}/src/lib.rs`

**Step 4: Extract doc comments**
- Read `src/lib.rs`
- Extract module-level docs (`/*!` ... `*/`)
- Extract top-level docs (`///` at start of file)
- Stop after first ~200 lines or when non-doc content starts

**Step 5: Format output**
- Strip `/*!`, `*/`, `///` markers
- Keep code blocks intact (indented or fenced)
- Print to stdout

### Error Handling

**Crate not found in Cargo.lock:**
```
Error: Crate 'serde' not found in Cargo.lock
Are you in a Rust project directory?
```

**Source not in registry:**
```
Error: Source for walkdir v2.5.0 not found in cargo registry
Try running: cargo fetch
```

**Not in a Rust project:**
```
Error: Cargo.lock not found
Run this command from a Rust project directory.
```

## Script Implementation (Phase 1 - MVP)

### Minimal viable script:

```python
#!/usr/bin/env python3
"""
rust-docs - Show Rust crate documentation from source

Usage:
    rust-docs <crate-name>
"""

import sys
import os
import re
from pathlib import Path

def find_cargo_lock():
    """Walk up directories to find Cargo.lock"""
    current = Path.cwd()
    while current != current.parent:
        cargo_lock = current / "Cargo.lock"
        if cargo_lock.exists():
            return cargo_lock
        current = current.parent
    return None

def parse_version(cargo_lock_path, crate_name):
    """Extract version for crate from Cargo.lock"""
    content = cargo_lock_path.read_text()
    # Simple regex for [[package]] sections
    pattern = rf'\[\[package\]\]\s+name = "{crate_name}"\s+version = "([^"]+)"'
    match = re.search(pattern, content)
    if match:
        return match.group(1)
    return None

def find_crate_source(crate_name, version):
    """Locate crate source in cargo registry"""
    registry_base = Path.home() / ".cargo" / "registry" / "src"
    
    # Find registry directory (usually index.crates.io-*)
    registry_dirs = list(registry_base.glob("index.crates.io-*"))
    if not registry_dirs:
        return None
    
    # Look for crate-version directory
    for reg_dir in registry_dirs:
        crate_dir = reg_dir / f"{crate_name}-{version}"
        if crate_dir.exists():
            return crate_dir / "src" / "lib.rs"
    
    return None

def extract_docs(lib_path, max_lines=200):
    """Extract doc comments from lib.rs"""
    lines = lib_path.read_text().split('\n')
    doc_lines = []
    in_module_doc = False
    
    for i, line in enumerate(lines[:max_lines]):
        # Module-level doc comment start
        if line.strip().startswith('/*!'):
            in_module_doc = True
            doc_lines.append(line.strip()[3:])  # Remove /*!
            continue
        
        # Module-level doc comment end
        if in_module_doc and '*/' in line:
            doc_lines.append(line.split('*/')[0])
            break
        
        # Inside module doc
        if in_module_doc:
            doc_lines.append(line)
            continue
        
        # Line doc comments at top level
        if line.strip().startswith('///'):
            doc_lines.append(line.strip()[3:].strip())
            continue
        
        # Stop if we hit actual code (not comments or blank lines)
        if line.strip() and not line.strip().startswith('//'):
            break
    
    return '\n'.join(doc_lines)

def main():
    if len(sys.argv) != 2:
        print("Usage: rust-docs <crate-name>")
        sys.exit(1)
    
    crate_name = sys.argv[1]
    
    # Step 1: Find Cargo.lock
    cargo_lock = find_cargo_lock()
    if not cargo_lock:
        print("Error: Cargo.lock not found", file=sys.stderr)
        print("Run this command from a Rust project directory.", file=sys.stderr)
        sys.exit(1)
    
    # Step 2: Get version
    version = parse_version(cargo_lock, crate_name)
    if not version:
        print(f"Error: Crate '{crate_name}' not found in Cargo.lock", file=sys.stderr)
        sys.exit(1)
    
    # Step 3: Find source
    lib_path = find_crate_source(crate_name, version)
    if not lib_path or not lib_path.exists():
        print(f"Error: Source for {crate_name} v{version} not found in cargo registry", file=sys.stderr)
        print("Try running: cargo fetch", file=sys.stderr)
        sys.exit(1)
    
    # Step 4: Extract and print docs
    docs = extract_docs(lib_path)
    print(f"# {crate_name} v{version}\n")
    print(docs)

if __name__ == "__main__":
    main()
```

## Skill Design: SKILL.md

### Location
```
~/Code/pipi/skills/rust-crate-docs/SKILL.md
```

### Content

```markdown
---
name: rust-crate-docs
description: Show documentation for Rust crates used in the current project. Use when user asks about how a crate works, what methods are available, or needs examples.
---

# Rust Crate Documentation

Shows plain-text documentation for Rust crates by reading source from cargo registry.
Uses the exact version specified in the current project's Cargo.lock.

## When to Use

- User asks: "How does X crate work?"
- User asks: "What methods does Y have?"
- User asks: "Show me examples for Z"
- You need to understand a dependency's API

## Command

```bash
{skill_dir}/rust-docs <crate-name>
```

The script must be run from within a Rust project directory (where Cargo.lock exists).

## Examples

```bash
# Show walkdir crate documentation
{skill_dir}/rust-docs walkdir

# Show serde documentation
{skill_dir}/rust-docs serde

# Show anyhow documentation
{skill_dir}/rust-docs anyhow
```

## How It Works

1. Finds Cargo.lock in current project
2. Extracts exact version of requested crate
3. Locates source in ~/.cargo/registry/src/
4. Reads and formats doc comments from src/lib.rs
5. Outputs plain text

## Limitations

- Only shows crate-level docs (from lib.rs), not specific modules/types yet
- Requires crate source to be downloaded (run `cargo fetch` if missing)
- Only works when run from a Rust project directory

## Error Messages

If you see "Cargo.lock not found": ensure you're in a Rust project directory

If you see "Crate not found in Cargo.lock": the crate isn't a dependency of this project

If you see "Source not found": run `cargo fetch` to download sources
```

## Implementation Steps

### Phase 1: MVP (First Version)

1. **Create skill directory**
   ```bash
   mkdir -p ~/Code/pipi/skills/rust-crate-docs
   ```

2. **Write script**
   - Create `rust-docs` with above Python implementation
   - Make executable: `chmod +x rust-docs`
   - Test manually: `cd ~/Code/kbase && ~/Code/pipi/skills/rust-crate-docs/rust-docs walkdir`

3. **Write SKILL.md**
   - Use template above
   - Test with agent: ask "how does walkdir work?"

4. **Test edge cases**
   - Not in a Rust project
   - Crate not in dependencies
   - Source not downloaded

### Phase 2: Enhancements (Future)

1. **Show specific items**
   ```bash
   rust-docs walkdir::WalkDir
   rust-docs serde::Deserialize
   ```
   - Parse `::` separator
   - Search for struct/trait/fn definition
   - Extract item-specific docs

2. **Extract examples only**
   ```bash
   rust-docs --examples walkdir
   ```
   - Find all code blocks marked with ```
   - Return just the examples

3. **Better doc parsing**
   - Handle multi-file crates
   - Follow `pub use` re-exports
   - Show method signatures

4. **Cache frequently used crates**
   - Speed up repeated lookups

## Testing Plan

### Manual Tests

```bash
cd ~/Code/kbase

# Should show walkdir docs
~/Code/pipi/skills/rust-crate-docs/rust-docs walkdir

# Should show anyhow docs  
~/Code/pipi/skills/rust-crate-docs/rust-docs anyhow

# Should error - not in project
cd /tmp
~/Code/pipi/skills/rust-crate-docs/rust-docs walkdir

# Should error - not a dependency
cd ~/Code/kbase
~/Code/pipi/skills/rust-crate-docs/rust-docs tokio
```

### Agent Tests

Start pi in kbase directory, ask:
- "How does walkdir work?"
- "Show me examples from the walkdir crate"
- "What methods does WalkDir have?" (should work in Phase 1, better in Phase 2)

## Notes

- Keep script simple and readable
- Standard Python 3 only (no external deps)
- Works with pi's `{skill_dir}` substitution
- Human-usable too (not just for agents)
- Fast enough for interactive use (<100ms)

## Future Ideas

- Support `--module` flag to show specific module docs
- Integrate with `cargo tree` to show dependency docs too
- Create a `rust-docs --search <term>` to find related items
- Web fallback to docs.rs if source not available
