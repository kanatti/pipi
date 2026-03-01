# Session Fork Feature

## Overview

Session forking allows you to create a copy of the current conversation and spawn it in a new iTerm window. Like git branches, but for AI conversation trees.

## Integration with Manager

Session forking is a **manager capability** because the manager can:
1. Access and copy session files
2. Spawn new iTerm windows
3. Launch pi with specific session files

This fits naturally alongside `/spawn` for workers.

## Use Cases

1. **Parallel exploration** - Try different approaches from same starting point
2. **Non-destructive experiments** - Fork before risky changes
3. **Compare solutions** - Multiple paths in parallel
4. **Preserve running session** - Fork a session that's busy in another window

## Command

```
/fork <name>
```

**Example:**
```
> /fork experiment-refactor

# Manager does:
# 1. Copy: current-session.jsonl → current-session-fork-experiment-refactor.jsonl
# 2. Spawn new iTerm window
# 3. Launch: pi --session /path/to/fork.jsonl
```

## Implementation

### Manager Extension (`worktree-manager.ts`)

Add to existing manager commands:

```typescript
// In manager mode
pi.registerCommand("fork", {
  description: "Fork current session to new iTerm window",
  handler: async (args, ctx) => {
    const forkName = args.trim();
    if (!forkName) {
      ctx.ui.notify("Usage: /fork <name>", "error");
      return;
    }
    
    // 1. Get current session path
    const currentSession = ctx.sessionManager.getSessionPath();
    
    // 2. Create fork path
    const forkSession = currentSession.replace(
      /\.jsonl$/, 
      `-fork-${forkName}.jsonl`
    );
    
    // 3. Copy session file
    await pi.bash(`cp "${currentSession}" "${forkSession}"`);
    
    // 4. Spawn new iTerm with forked session
    await spawnITermWindow(forkSession, ctx);
    
    ctx.ui.notify(`Forked session: ${forkName}`, "info");
  }
});
```

### Helper Function

```typescript
async function spawnITermWindow(sessionPath: string, ctx: ExtensionCommandContext) {
  const cwd = process.cwd();
  
  const script = `
    tell application "iTerm"
      create window with default profile
      tell current session of current window
        write text "cd ${cwd.replace(/"/g, '\\"')}"
        write text "pi --session ${sessionPath.replace(/"/g, '\\"')}"
      end tell
    end tell
  `;
  
  await ctx.bash(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}
```

## Workflow Comparison

### Before (Manual)
```bash
# Terminal 1 - running pi
# Nothing to do

# Terminal 2 - new iTerm
$ cp ~/.pi/agent/sessions/.../session.jsonl session-fork.jsonl
$ pi --session ~/.pi/agent/sessions/.../session-fork.jsonl
```

### After (Automated)
```bash
# Terminal 1 - running pi
> /fork experiment-a
# New iTerm window appears with forked session ready!
```

## Commands Summary

Once merged into `worktree-manager.ts`:

```
/spawn <name>       # Spawn worker in new iTerm window
/fork <name>        # Fork current session to new iTerm window
/worktree <branch>  # Create worktree (worker command)
```

## Next Steps

1. ✅ Document the design (this file)
2. ⏳ Check if `worktree-manager.ts` exists
3. ⏳ Implement `/fork` command in manager mode
4. ⏳ Test: fork session, verify new window opens
5. ⏳ Integrate with existing manager commands

## Notes

- Fork creates a **copy** - original session continues independently
- Fork file naming: `original-fork-<name>.jsonl`
- Both sessions can run simultaneously without conflicts
- iTerm-specific (uses AppleScript) - could add tmux support later
