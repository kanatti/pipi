---
name: pi-package-dev
description: Reference for pi package structure - package.json manifest, bundling dependencies, conventional directories, and publishing. Use when configuring pipi as a package or setting up package.json.
---

# Pi Package Development

Quick reference for developing pi packages (like pipi).

## Package Structure

Pi packages bundle extensions, skills, prompt templates, and themes for sharing via npm or git.

### Declaring the Package

Add to `package.json`:

```json
{
  "name": "my-package",
  "keywords": ["pi-package"],  // For discoverability
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

**Convention directories** (auto-discovered if no `pi` manifest):
- `extensions/` - `.ts` and `.js` files
- `skills/` - `SKILL.md` files (recursive) and top-level `.md` files
- `prompts/` - `.md` files
- `themes/` - `.json` files

### Gallery Metadata

Add preview for the package gallery:

```json
{
  "pi": {
    "video": "https://example.com/demo.mp4",  // MP4, autoplays on hover
    "image": "https://example.com/screenshot.png"  // PNG/JPEG/GIF/WebP
  }
}
```

## Dependencies

### Peer Dependencies

Pi bundles these - **do NOT include in `dependencies`**:

```json
{
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-tui": "*",
    "@sinclair/typebox": "*"
  }
}
```

### Runtime Dependencies

Third-party packages needed at runtime:

```json
{
  "dependencies": {
    "zod": "^3.0.0",
    "chalk": "^5.0.0"
  }
}
```

### Bundled Pi Packages

To include other pi packages, bundle them:

```json
{
  "dependencies": {
    "shitty-extensions": "^1.0.1"
  },
  "bundledDependencies": ["shitty-extensions"],
  "pi": {
    "extensions": [
      "extensions",
      "node_modules/shitty-extensions/extensions"
    ]
  }
}
```

## Installing & Testing

### Local Development

```bash
# Test without installing
pi -e ./extensions/my-extension.ts

# Install globally for testing
npm link
pi  # Should auto-load package

# Project-level install
cd /path/to/test-project
npm install /path/to/my-package
```

### Publishing

```bash
# Publish to npm
npm publish

# Users install with:
pi install npm:my-package@1.0.0       # Global
pi install npm:my-package@1.0.0 -l   # Project-local

# Or from git:
pi install git:github.com/user/repo@v1
pi install https://github.com/user/repo
```

## Package Sources

Users can install from:

1. **npm**: `npm:@scope/pkg@1.2.3`
2. **git**: `git:github.com/user/repo@v1` or raw `https://` URLs
3. **local**: `/absolute/path` or `./relative/path`

## Filtering Resources

Users can selectively load resources:

```json
{
  "packages": [
    {
      "source": "npm:my-package",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],  // Disable all skills
      "prompts": ["prompts/review.md"]  // Only this prompt
    }
  ]
}
```

## Directory Structure Example

```
my-package/
├── package.json           # With pi manifest
├── README.md
├── extensions/            # Extensions auto-discovered
│   ├── tool.ts
│   └── helper.ts
├── skills/                # Skills auto-discovered
│   └── my-skill/
│       └── SKILL.md
├── prompts/               # Prompts auto-discovered
│   └── review.md
└── themes/                # Themes auto-discovered
    └── custom.json
```

## Key Commands

```bash
pi install npm:pkg          # Install globally
pi install npm:pkg -l       # Install to project
pi remove npm:pkg           # Remove
pi list                     # Show installed
pi update                   # Update non-pinned
pi -e ./ext.ts              # Try extension temporarily
```

## Tips

- Use `pi-package` keyword for discoverability
- Test with `-e` flag before publishing
- Document dependencies in README
- Include examples in package
- Version carefully (npm packages are cached)
- Test in both global and project contexts
- Use conventional directories for simplicity
- Bundle deps only when needed (adds to tarball size)

## Related Docs

- Full details: `~/Code/pi-mono/packages/coding-agent/docs/packages.md`
- Extensions: See `pi-extension-dev` skill
- Skills: See `pi-quick-ref` skill
