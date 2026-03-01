# Worktree Manager Proposal

## Goal

Run multiple pi instances in parallel worktrees, with ability to:
1. Spawn new tmux windows from main pi session
2. Workers can send messages back to manager
3. Manager can orchestrate worktree creation and session migration

## Architecture

### Components

```
┌─────────────────────────────────────────┐
│ Manager Terminal                        │
│ (Main project, running pi)              │
│                                         │
│ - Extension: worktree-manager.ts        │
│ - Unix socket server                    │
│ - Commands: /tmux <name>                │
└────────┬────────────────────────────────┘
         │
         │ spawns tmux windows
         │ listens on socket
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│ Tmux   │ │ Tmux   │
│ auth   │ │ refac  │
│        │ │        │
│ pi     │ │ pi     │
│ worker │ │ worker │
└───┬────┘ └───┬────┘
    │          │
    │ sends messages via socket
    │          │
    └──────────┘
```

### Files Needed

```
pipi/
├── extensions/
│   └── worktree-manager.ts      # Manager + worker extension (detects mode)
├── bin/
│   └── piworker                 # Wrapper script for spawning workers
└── research/                    # These docs
```

## Communication Protocol

### Messages: Worker → Manager

```typescript
// Worker wants to create a new worktree
{
  type: "create_worktree",
  branch: "new-feature",
  fromBranch: "main",           // optional, defaults to current
  sessionId: "abc-123",         // current session to preserve
  workerId: "auth"              // identifies sender
}

// Worker requests status
{
  type: "status",
  workerId: "auth"
}

// Worker shutting down gracefully
{
  type: "shutdown",
  workerId: "auth"
}
```

### Messages: Manager → Worker

Manager doesn't send to workers directly. Instead, manager:
1. Kills worker process (if needed)
2. Creates worktree
3. Spawns new tmux window with pi in new worktree

## Implementation Plan

### Phase 1: Basic Tmux Spawning (No communication)

**Goal:** Get `/tmux <name>` working to spawn new windows

**Files:**
- `bin/piworker` - Simple wrapper that starts pi
- `extensions/worktree-manager.ts` - Implements `/tmux` command

**Test:**
```
$ pi
> /tmux auth
# New tmux window opens with pi running
```

### Phase 2: Socket Communication

**Goal:** Workers can send messages to manager

**Add:**
- Manager starts unix socket server
- Workers detect `PI_MANAGER_SOCKET` env var
- Workers can send simple messages

**Test:**
```
# In manager
> /tmux auth

# In worker window
> /ping-manager
# Manager receives message, logs it
```

### Phase 3: Worktree Creation

**Goal:** `/worktree <branch>` creates worktree and restarts worker

**Add:**
- Worker sends `create_worktree` message
- Manager creates git worktree
- Manager kills worker pi, spawns new one in worktree path

**Test:**
```
# In worker window
> /worktree new-feature
# Worker pi exits, new window opens in worktree
```

### Phase 4: Session Migration

**Goal:** Preserve session history when switching worktrees

**Add:**
- Include sessionId in create_worktree message
- Manager copies/forks session to new worktree path
- New pi instance resumes with session history

## Technical Details

### Socket Location

```typescript
const socketPath = path.join(
  os.homedir(), 
  '.pi/swarm', 
  `manager-${process.pid}.sock`
);
```

Include PID to allow multiple managers.

### Worker Detection

```typescript
export default function(pi: ExtensionAPI) {
  const managerSocket = process.env.PI_MANAGER_SOCKET;
  
  if (managerSocket) {
    // We're a worker
    registerWorkerCommands(pi, managerSocket);
  } else {
    // We're a manager
    registerManagerCommands(pi);
    startSocketServer(pi);
  }
}
```

One extension, two modes!

### piworker Script

```bash
#!/usr/bin/env bash
set -e

WORKER_ID="$1"
MANAGER_SOCKET="$2"

if [ -z "$WORKER_ID" ] || [ -z "$MANAGER_SOCKET" ]; then
  echo "Usage: piworker <worker-id> <manager-socket>"
  exit 1
fi

export PI_MANAGER_SOCKET="$MANAGER_SOCKET"
export PI_WORKER_ID="$WORKER_ID"

exec pi
```

### Spawning from Manager

```typescript
const socketPath = getSocketPath();  // ~/.pi/swarm/manager-PID.sock
const workerId = args._[0];          // e.g., "auth"

await pi.bash(`tmux new-window -n "${workerId}" "piworker ${workerId} ${socketPath}"`);
```

### Worker Sending Message

```typescript
import * as net from 'net';

function sendToManager(socket: string, msg: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = net.connect(socket, () => {
      client.write(JSON.stringify(msg));
      client.end();
      resolve();
    });
    client.on('error', reject);
  });
}

// In /worktree command
await sendToManager(managerSocket, {
  type: 'create_worktree',
  branch: newBranch,
  sessionId: pi.getSessionManager().getSessionId(),
  workerId: process.env.PI_WORKER_ID
});

// Exit - manager will restart us
process.exit(0);
```

## Open Questions

1. **How to kill worker pi gracefully?**
   - Worker sends shutdown, then `process.exit(0)`?
   - Manager tracks PIDs, sends SIGTERM?

2. **Session migration across different cwds?**
   - `SessionManager.forkFrom(sourcePath, targetCwd)`
   - Or just copy the session file and update cwd?

3. **What if manager dies?**
   - Workers become orphaned
   - Check socket exists before sending?
   - Degrade gracefully (show error, continue working)

4. **Multiple managers?**
   - Use PID in socket path: `manager-12345.sock`
   - Workers inherit correct socket path from env

5. **Worker discovery?**
   - Manager maintains registry in `~/.pi/swarm/workers.json`?
   - Or just rely on socket messages?

## Next Step

**Start with Phase 1** - Simple tmux spawning with no communication.

Verify we can:
1. Create `bin/piworker` script
2. Implement `/tmux` command
3. Spawn new tmux windows running pi

Once that works, add socket communication.
