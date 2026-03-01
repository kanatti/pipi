# Subagent Example Analysis

From: `~/Code/pi-mono/packages/coding-agent/examples/extensions/subagent/`

## How it works

### Spawning Pi Processes

```typescript
import { spawn } from "node:child_process";

const args = ["--mode", "json", "-p", "--no-session"];
if (agent.model) args.push("--model", agent.model);
if (agent.tools) args.push("--tools", agent.tools.join(","));
args.push(`Task: ${task}`);

const proc = spawn("pi", args, { 
  cwd: cwd ?? defaultCwd, 
  shell: false, 
  stdio: ["ignore", "pipe", "pipe"] 
});
```

**Key points:**
- Uses `--mode json` to get structured output (JSONL events)
- Uses `-p` (print mode) for non-interactive execution
- Uses `--no-session` to avoid session persistence
- Pipes stdout/stderr to capture output
- Each subprocess is independent

### Capturing Output

```typescript
let buffer = "";

proc.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";  // Keep incomplete line
  
  for (const line of lines) {
    const event = JSON.parse(line);
    
    if (event.type === "message_end") {
      // Got a complete message
      currentResult.messages.push(event.message);
    }
    
    if (event.type === "tool_result_end") {
      // Got a tool result
      currentResult.messages.push(event.message);
    }
  }
});

proc.stderr.on("data", (data) => {
  currentResult.stderr += data.toString();
});

proc.on("close", (code) => {
  // Process is done
});
```

**Key points:**
- Pi outputs JSONL in `--mode json`
- Each line is a complete JSON event
- Buffer handling for incomplete lines
- Events: `message_end`, `tool_result_end`, etc.

### Aborting Subprocesses

```typescript
if (signal) {  // AbortSignal
  const killProc = () => {
    wasAborted = true;
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    }, 5000);
  };
  
  signal.addEventListener("abort", killProc);
}
```

**Key points:**
- Uses AbortSignal for cancellation
- SIGTERM first, then SIGKILL after 5s
- Ctrl+C propagates to all subprocesses

## Differences from Our Use Case

| Subagent Example | Worktree Manager |
|------------------|------------------|
| Spawns temporary pi processes | Spawns long-running pi in tmux |
| Captures output via stdout | Need bidirectional communication |
| Subprocess exits when done | Windows stay open for user interaction |
| No user interaction in subprocess | User types in tmux windows |
| Parent controls subprocess | Workers can send messages back |

## What We Can Reuse

1. **Spawning mechanism** - `child_process.spawn()` works for any command
2. **JSON mode** - Could use for initial communication
3. **Abort handling** - Useful for cleanup

## What's Different

1. **Long-running processes** - Can't capture all output upfront
2. **Interactive** - User types in spawned windows
3. **Bidirectional** - Workers send commands to manager
4. **Persistence** - Sessions need to migrate across worktrees

## For Tmux Spawning

Instead of:
```typescript
const proc = spawn("pi", args, { stdio: ["ignore", "pipe", "pipe"] });
```

We need:
```typescript
const proc = spawn("tmux", [
  "new-window",
  "-n", branchName,
  "piworker", branchName  // Our wrapper script
], { 
  detached: true,  // Don't wait for it
  stdio: "ignore"  // Don't capture output
});
```

The `piworker` script:
```bash
#!/bin/bash
branch=$1
export PI_MANAGER_SOCKET=~/.pi/swarm/manager.sock
export PI_WORKER_BRANCH=$branch
exec pi  # Normal pi, but with env vars
```

Manager doesn't capture output - instead listens on socket for messages.
