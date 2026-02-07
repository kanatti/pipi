---
name: pi-extension-dev
description: Reference for creating and modifying extensions - registering tools, handling events, custom UI, commands, and state management. Use when building extensions or adding custom tools to pi.
---

# Pi Extension Development

Quick reference for creating extensions (like those in pipi).

## Basic Structure

Extensions are TypeScript modules that export a default function:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("session_start", async (event, ctx) => {
    ctx.ui.notify("Extension loaded!", "info");
  });

  // Register tools, commands, shortcuts
  pi.registerTool({ ... });
  pi.registerCommand("cmd", { ... });
  pi.registerShortcut("ctrl+x", { ... });
}
```

## Available Imports

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";  // Schema for tool params
import { StringEnum } from "@mariozechner/pi-ai";  // Google-compatible enums
import { Text, Component } from "@mariozechner/pi-tui";  // Custom UI
```

## Key Events

### Lifecycle

```typescript
pi.on("session_start", async (event, ctx) => {});
pi.on("session_shutdown", async (event, ctx) => {});
pi.on("before_agent_start", async (event, ctx) => {
  return {
    message: { content: "Extra context", display: true },
    systemPrompt: event.systemPrompt + "\nExtra instructions",
  };
});
```

### Tool Events

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    if (event.input.command.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  }
});

pi.on("tool_result", async (event, ctx) => {
  // Modify result before LLM sees it
  return { content: [...], details: {...} };
});
```

### Turn Events

```typescript
pi.on("turn_start", async (event, ctx) => {});
pi.on("turn_end", async (event, ctx) => {});
pi.on("context", async (event, ctx) => {
  // Modify messages before LLM call
  return { messages: filtered };
});
```

## Custom Tools

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),  // Use StringEnum!
    text: Type.Optional(Type.String()),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Stream progress
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });

    // Check cancellation
    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Cancelled" }] };
    }

    // Return result
    return {
      content: [{ type: "text", text: "Done" }],
      details: { data: "..." },  // For state & rendering
    };
  },

  // Optional: Custom rendering
  renderCall(args, theme) {
    return new Text(theme.fg("toolTitle", "my_tool"), 0, 0);
  },
  renderResult(result, { expanded, isPartial }, theme) {
    return new Text(theme.fg("success", "✓ Done"), 0, 0);
  },
});
```

### Tool Output Truncation

**IMPORTANT**: Tools must truncate output to avoid context overflow:

```typescript
import {
  truncateHead,      // Keep first N lines/bytes
  truncateTail,      // Keep last N lines/bytes
  DEFAULT_MAX_BYTES, // 50KB
  DEFAULT_MAX_LINES, // 2000
  formatSize,
} from "@mariozechner/pi-coding-agent";

const truncation = truncateHead(output, {
  maxLines: DEFAULT_MAX_LINES,
  maxBytes: DEFAULT_MAX_BYTES,
});

let result = truncation.content;
if (truncation.truncated) {
  const tempFile = writeTempFile(output);
  result += `\n\n[Output truncated: ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}. Full: ${tempFile}]`;
}
```

## Custom Commands

```typescript
pi.registerCommand("stats", {
  description: "Show session statistics",
  handler: async (args, ctx) => {
    const count = ctx.sessionManager.getEntries().length;
    ctx.ui.notify(`${count} entries`, "info");
  },
});
```

## UI Methods

```typescript
// Dialogs
const choice = await ctx.ui.select("Pick:", ["A", "B", "C"]);
const ok = await ctx.ui.confirm("Delete?", "Cannot undo");
const text = await ctx.ui.input("Name:", "placeholder");
const edited = await ctx.ui.editor("Edit:", "prefill");

// Notifications
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"

// Status (footer)
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // Clear

// Widget (above/below editor)
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
ctx.ui.setWidget("my-widget", undefined);  // Clear

// Working message (during streaming)
ctx.ui.setWorkingMessage("Thinking deeply...");
ctx.ui.setWorkingMessage();  // Restore default

// Custom component (replaces editor temporarily)
const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  // Return a Component with onKey handler
  // Call done(value) to close and return
});
```

## Context (ctx) Properties

```typescript
ctx.ui                           // UI methods
ctx.hasUI                        // false in print mode
ctx.cwd                          // Working directory
ctx.sessionManager               // Read session state
ctx.model                        // Current model
ctx.modelRegistry                // All models
ctx.isIdle()                     // Agent idle?
ctx.abort()                      // Cancel current turn
ctx.shutdown()                   // Exit pi
ctx.getContextUsage()            // Current token usage
```

## ExtensionAPI Methods

```typescript
// Messaging
pi.sendMessage({ content: "...", display: true }, { deliverAs: "steer" });
pi.sendUserMessage("What is 2+2?");

// State
pi.appendEntry("my-state", { data: "..." });  // Persist state

// Session control
pi.setSessionName("My Session");
pi.setLabel(entryId, "checkpoint");

// Tools & commands
pi.getActiveTools();
pi.getAllTools();
pi.setActiveTools(["read", "bash"]);
pi.getCommands();  // Extension, prompt, and skill commands

// Model
pi.setModel(model);
pi.getThinkingLevel();
pi.setThinkingLevel("high");

// Events
pi.events.on("custom:event", (data) => {});
pi.events.emit("custom:event", { ... });
```

## State Management

Store state in tool result `details` for proper branching:

```typescript
let items: string[] = [];

pi.on("session_start", async (event, ctx) => {
  // Reconstruct from session
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      items = entry.message.details?.items ?? [];
    }
  }
});

pi.registerTool({
  name: "my_tool",
  async execute(id, params, signal, onUpdate, ctx) {
    items.push("new");
    return {
      content: [{ type: "text", text: "Added" }],
      details: { items: [...items] },  // Store for reconstruction
    };
  },
});
```

## Extension Locations

Auto-discovered from:
- `~/.pi/agent/extensions/*.ts` (global)
- `.pi/extensions/*.ts` (project)
- `extensions/*/index.ts` (subdirectories)

Or via settings:
```json
{
  "extensions": ["/path/to/extension.ts"]
}
```

## Tips

- Use `disable-model-invocation: true` in skills for reference-only content
- Always check `ctx.hasUI` before using UI methods
- Truncate tool output (50KB / 2000 lines max)
- Use `StringEnum` for enums (Google compatibility)
- Store state in tool `details` for branching support
- Test with `pi -e ./extension.ts`
- Handle `signal.aborted` in long operations
- Use `onUpdate` for streaming progress

## Related Docs

- Full details: `~/Code/pi-mono/packages/coding-agent/docs/extensions.md`
- TUI components: `~/Code/pi-mono/packages/coding-agent/docs/tui.md`
- Examples: `~/Code/pi-mono/packages/coding-agent/examples/extensions/`
