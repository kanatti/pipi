# Pi Extension Loading & Dependencies

This document explains how pi discovers, loads, and executes extensions, including dependency management.

## Overview

Pi extensions are TypeScript/JavaScript modules that extend pi's functionality. The loading system supports both simple single-file extensions and complex multi-file packages with npm dependencies.

## Extension Discovery

Pi discovers extensions from multiple locations in order:

### 1. Discovery Locations

```
~/.pi/agent/extensions/     # Global extensions (all projects)
.pi/extensions/             # Project-local extensions  
<configured-paths>          # From settings.json
```

### 2. Discovery Rules

For each location, pi scans for:

1. **Direct files**: `*.ts` or `*.js` files → load directly
2. **Directory with index**: `index.ts` or `index.js` → load index file  
3. **Package with manifest**: `package.json` with `"pi"` field → load declared extensions

Example directory structure:
```
~/.pi/agent/extensions/
├── simple-ext.ts                    # Direct file
├── complex-ext/
│   └── index.ts                     # Directory with index
└── package-ext/
    ├── package.json                 # Package with manifest
    ├── node_modules/               
    └── src/
        └── index.ts
```

### 3. Package Manifest Format

```json
{
  "name": "my-extension",
  "dependencies": {
    "tree-sitter": "^0.21.0",
    "lodash": "^4.17.0"
  },
  "pi": {
    "extensions": ["./src/index.ts", "./src/another.ts"]
  }
}
```

## Module Loading with Jiti

Pi uses [jiti](https://github.com/unjs/jiti) to load TypeScript extensions without compilation.

### Development Mode (Node.js)

```javascript
const jiti = createJiti({
  alias: {
    "@mariozechner/pi-coding-agent": "/path/to/pi/index.js",
    "@sinclair/typebox": "/path/to/typebox",
    "@mariozechner/pi-tui": "/path/to/tui",
    "@mariozechner/pi-ai": "/path/to/ai"
  }
});
```

- Extensions resolve imports via standard Node.js resolution
- `node_modules` packages work normally
- Fast development iteration

### Compiled Binary Mode (Bun)

```javascript
const jiti = createJiti({
  virtualModules: {
    "@mariozechner/pi-coding-agent": bundledPiCodingAgent,
    "@sinclair/typebox": bundledTypebox,
    "@mariozechner/pi-tui": bundledPiTui,
    "@mariozechner/pi-ai": bundledPiAi
  },
  tryNative: false  // jiti handles ALL imports
});
```

- Core pi packages are pre-bundled into the binary
- Extensions still resolve their own `node_modules` dependencies
- No bundling required for extensions themselves

## Dependency Management

### Single-File Extensions

**Available packages** (via virtual modules or aliases):
- `@mariozechner/pi-coding-agent` - Extension API types and utilities
- `@sinclair/typebox` - Schema validation  
- `@mariozechner/pi-tui` - TUI components
- `@mariozechner/pi-ai` - AI utilities
- Node.js built-ins (`node:fs`, `node:path`, etc.)

**Example:**
```typescript
// extensions/simple.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import * as fs from "node:fs";

export default function (pi: ExtensionAPI) {
  // Extension logic
}
```

### Package Extensions

**Setup:**
```bash
cd ~/.pi/agent/extensions/my-extension/
npm init
npm install tree-sitter tree-sitter-bash lodash
# Create package.json with "pi" field
```

**Available packages**:
- All single-file extension packages
- Any npm packages in `node_modules/`
- Local modules via relative imports

**Example:**
```typescript
// extensions/my-extension/src/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import Parser from "tree-sitter";
import Bash from "tree-sitter-bash";
import _ from "lodash";
import { myHelper } from "./utils.js";

export default function (pi: ExtensionAPI) {
  const parser = new Parser();
  parser.setLanguage(Bash);
  
  // Extension logic using tree-sitter and lodash
}
```

## Extension API Creation

### Runtime Sharing

All extensions share a single `ExtensionRuntime` object:

```javascript
const runtime = createExtensionRuntime();  // Shared state

// Each extension gets its own API that delegates to shared runtime
function createExtensionAPI(extension, runtime, cwd, eventBus) {
  return {
    // Registration methods - write to extension object
    on(event, handler) { 
      extension.handlers.set(event, [...handlers, handler]);
    },
    registerTool(tool) { 
      extension.tools.set(tool.name, tool);
    },
    
    // Action methods - delegate to shared runtime  
    sendMessage: runtime.sendMessage,
    setModel: runtime.setModel,
    exec: (cmd, args, opts) => execCommand(cmd, args, cwd, opts),
    
    // Shared event bus for inter-extension communication
    events: eventBus
  };
}
```

### Lazy Binding Pattern

Extension APIs are created during loading, but action methods are bound later:

```javascript
// During extension loading: throwing stubs
const runtime = {
  sendMessage: () => { throw new Error("Runtime not initialized"); },
  setModel: () => { throw new Error("Runtime not initialized"); }
};

// After core initialization: real implementations  
runtime.sendMessage = actualSendMessageImplementation;
runtime.setModel = actualSetModelImplementation;
```

This allows extensions to register handlers during load while preventing premature action calls.

## Extension Object Structure

Each loaded extension becomes an object:

```javascript
{
  path: "~/.pi/extensions/my-ext.ts",           // Original path
  resolvedPath: "/full/absolute/path",          // Resolved path
  handlers: Map<EventType, Handler[]>,          // Event listeners
  tools: Map<string, ToolDefinition>,           // Custom tools
  commands: Map<string, Command>,               // Slash commands  
  shortcuts: Map<string, Shortcut>,             // Keyboard shortcuts
  flags: Map<string, Flag>,                     // CLI flags
  messageRenderers: Map<string, Renderer>       // Custom UI renderers
}
```

## Execution Phase

### Context Creation

Extension contexts are created fresh for each event/tool call:

```javascript
createContext() {
  return {
    ui: this.uiContext,                    // Live UI reference
    model: this.getModel(),                // Current model (resolved at call time)
    sessionManager: this.sessionManager,   // Live session reference
    cwd: this.cwd,                        // Current working directory
    isIdle: () => this.isIdleFn(),        // Live status functions
    abort: () => this.abortFn()
  };
}
```

This ensures extensions always see current state, not stale cached values.

### Event Execution

```javascript
async emit(event) {
  const ctx = this.createContext();  // Fresh context
  
  for (const ext of this.extensions) {
    const handlers = ext.handlers.get(event.type) ?? [];
    
    for (const handler of handlers) {
      try {
        await handler(event, ctx);  // Execute extension handler
      } catch (err) {
        // Isolate errors - one extension's failure doesn't break others
        this.emitError({ 
          extensionPath: ext.path, 
          event: event.type,
          error: err.message,
          stack: err.stack 
        });
      }
    }
  }
}
```

### Error Isolation

Each extension handler runs in try/catch to ensure:
- One extension's error doesn't crash pi
- Other extensions continue to work  
- Error details are logged with extension path context

## Inter-Extension Communication

### Shared Event Bus

```typescript
// Extension A
pi.events.on("data:updated", (data) => {
  console.log("Extension A received:", data);
});

// Extension B  
pi.events.emit("data:updated", { key: "value" });
```

### Shared Runtime State

```typescript
// Extension A sets a model
await pi.setModel(claudeModel);

// Extension B sees the change
const current = ctx.model; // Gets the model set by Extension A
```

## Best Practices

### 1. Choose the Right Extension Type

**Single-file** for:
- Simple functionality  
- No external dependencies
- Quick prototypes

**Package** for:
- Complex functionality
- External npm dependencies  
- Multi-file organization
- Shared/published extensions

### 2. Handle Dependencies Gracefully

```typescript
export default function (pi: ExtensionAPI) {
  let parser: Parser | null = null;
  
  try {
    // Try to load optional dependency
    const Parser = require("tree-sitter");
    const Bash = require("tree-sitter-bash");
    parser = new Parser();
    parser.setLanguage(Bash);
  } catch (err) {
    // Fall back to simpler implementation
    console.warn("tree-sitter not available, using regex fallback");
  }
  
  pi.registerTool({
    name: "parse_bash",
    async execute(id, params, signal, onUpdate, ctx) {
      if (parser) {
        return astBasedParsing(params.command);
      } else {
        return regexBasedParsing(params.command);  
      }
    }
  });
}
```

### 3. Error Handling

```typescript
pi.on("tool_call", async (event, ctx) => {
  try {
    // Extension logic
  } catch (err) {
    // Log error but don't throw - let other extensions continue
    console.error(`Extension error in ${event.toolName}:`, err);
    return { block: false }; // Don't block the tool call
  }
});
```

### 4. Resource Cleanup

```typescript
export default function (pi: ExtensionAPI) {
  const connections = new Set();
  
  pi.on("session_shutdown", async () => {
    // Clean up resources
    for (const conn of connections) {
      await conn.close();
    }
  });
}
```

## Troubleshooting

### Extension Not Loading

1. Check file path and permissions
2. Verify TypeScript syntax  
3. Check for missing dependencies
4. Look at pi startup logs for error messages

### Dependencies Not Found

**Single-file extension:**
- Use only bundled packages or Node.js built-ins
- Consider converting to package extension

**Package extension:**  
- Run `npm install` in extension directory
- Check `package.json` has correct dependencies
- Verify import paths match installed packages

### Runtime Errors

- Extensions run in isolated error boundaries
- Check pi logs for extension-specific errors
- Use `console.log` for debugging (visible in terminal)
- Test with `pi -e ./my-extension.ts` for quick iteration

## Examples

See the `examples/extensions/` directory in pi's source for working examples of both single-file and package extensions.