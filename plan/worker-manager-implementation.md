# Worker Manager Implementation Plan

## Overview

System to run multiple pi instances (workers) in separate iTerm windows, coordinated by a central manager pi instance.

**Core concept:** Manager spawns workers, workers can send commands to manager (like "create worktree", "switch branch", etc.)

---

## What We've Validated (Experiments)

### ✅ Foundation Proven

- **exp01-iterm-track-close.js** - Spawn iTerm windows, track session IDs, close programmatically
- **exp02-socket-{server,client}.js** - Bidirectional socket communication (request/response)
- **exp03-env-pass.js** - Pass environment variables to spawned processes
- **exp04-worktree.js** - Create and manage git worktrees programmatically

**All experiments passed** - ready to build the real system.

---

## Architecture

```
┌─────────────────────────────────────┐
│ Manager (iTerm Window 1)            │
│ - Running: pi                       │
│ - Extension: worker-manager.ts      │
│ - Socket server listening           │
│ - Commands: /spawn <name>           │
└────────┬────────────────────────────┘
         │
         │ spawns workers
         │ listens for commands
         │
    ┌────┴────┬─────────┐
    │         │         │
    ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│Worker 1 │ │Worker 2 │ │Worker 3 │
│(iTerm)  │ │(iTerm)  │ │(iTerm)  │
│         │ │         │ │         │
│auth     │ │frontend │ │api      │
│pi       │ │pi       │ │pi       │
└────┬────┘ └────┬────┘ └────┬────┘
     │           │           │
     └───────────┴───────────┘
            │
      sends commands
      to manager
```

---

## Components to Build

### 1. Extension: `worker-manager.ts`

**Dual-mode extension** - detects if it's manager or worker:

```typescript
export default function(pi: ExtensionAPI) {
  const managerSocket = process.env.PI_MANAGER_SOCKET;
  
  if (managerSocket) {
    // Worker mode
    initWorker(pi, managerSocket);
  } else {
    // Manager mode
    initManager(pi);
  }
}
```

### 2. Manager Responsibilities

- Start unix socket server
- Track spawned workers (session IDs, PIDs)
- Handle commands from workers:
  - `create_worktree` - Create git worktree, restart worker in new location
  - `status` - Report worker registry
  - `shutdown` - Close specific worker
- Spawn workers via `/spawn <name>` command

### 3. Worker Responsibilities

- Connect to manager socket on startup
- Register with manager (send PID, worker ID)
- Provide commands:
  - `/worktree <branch>` - Request worktree creation
  - `/switch <branch>` - Switch to existing worktree
  - `/manager-status` - Query manager
- Exit gracefully when manager requests shutdown

### 4. Helper Script: `bin/piworker`

Wrapper to launch workers with environment variables:

```bash
#!/usr/bin/env bash
WORKER_ID="$1"
MANAGER_SOCKET="$2"

export PI_MANAGER_SOCKET="$MANAGER_SOCKET"
export PI_WORKER_ID="$WORKER_ID"

exec pi
```

---

## Implementation Phases

### Phase 1: Basic Manager/Worker (No Worktrees)

**Goal:** Manager spawns workers, workers connect via socket

**Build:**
1. `extensions/worker-manager.ts` - Dual-mode extension skeleton
2. Manager: Socket server + `/spawn` command
3. Worker: Connect to socket, send "hello" message
4. `bin/piworker` - Wrapper script

**Success:** 
- `/spawn auth` creates new iTerm window
- Worker pi connects to manager socket
- Manager receives "hello" from worker

**Reference:** Combines exp01 (iTerm), exp02 (socket), exp03 (env vars)

---

### Phase 2: Worker Registry

**Goal:** Manager tracks all active workers

**Build:**
1. Worker registry (Map of worker ID → session info)
2. Worker sends PID on connect
3. `/workers` command to list active workers
4. `/close <worker-id>` command to shutdown worker

**Success:**
- Manager knows all active workers
- Can close workers programmatically
- Workers exit cleanly

**Reference:** Uses exp01 session tracking

---

### Phase 3: Worktree Creation

**Goal:** Workers can request worktree creation

**Build:**
1. Worker command: `/worktree <branch>`
2. Manager receives request, creates worktree
3. Manager closes worker, spawns new one in worktree location
4. Worker resumes (optionally with session preserved)

**Success:**
- Worker types `/worktree new-feature`
- Manager creates worktree at `../pipi-new-feature/`
- New worker window opens in that location
- Original worker window closes

**Reference:** Uses exp04 (git worktree)

---

### Phase 4: Session Migration (Optional)

**Goal:** Preserve conversation history when switching worktrees

**Build:**
1. Worker includes session ID in worktree request
2. Manager copies session file to new worktree location
3. New worker restores session

**Success:**
- Worker with 10 messages requests worktree
- New worker starts with same 10 messages
- Conversation continues seamlessly

---

### Phase 5: Additional Features

**Possible additions:**
- `/switch <branch>` - Switch to existing worktree without creating
- `/merge <worker-id>` - Merge changes from worker branch
- Worker status indicators (which branch, dirty/clean)
- Auto-cleanup old worktrees
- Multiple managers (different projects)

---

## File Structure

```
pipi/
├── extensions/
│   └── worker-manager.ts          # Main extension
├── bin/
│   └── piworker                   # Worker wrapper script
├── experiments/
│   ├── lib/
│   │   └── iterm-scripts.js       # AppleScript helpers
│   ├── exp01-iterm-track-close.js # iTerm spawning
│   ├── exp02-socket-*.js          # Socket basics
│   ├── exp03-socket-*.js          # Bidirectional
│   ├── exp04-env-pass.js          # Env vars
│   └── exp05-worktree.js          # Git worktrees
└── plan/
    └── worker-manager-implementation.md  # This file
```

---

## Communication Protocol

### Messages: Worker → Manager

```typescript
// Worker registers on connect
{
  type: "register",
  workerId: "auth",
  pid: 12345
}

// Worker requests worktree
{
  type: "create_worktree",
  branch: "new-feature",
  fromBranch: "main",        // optional
  sessionId: "abc-123",      // optional
  workerId: "auth"
}

// Worker requests status
{
  type: "status",
  workerId: "auth"
}
```

### Messages: Manager → Worker

```typescript
// Response to request
{
  status: "success",
  message: "Worktree created at /path/to/worktree"
}

// Or error
{
  status: "error",
  error: "Branch already exists"
}

// Shutdown command
{
  type: "shutdown",
  reason: "Creating new worktree"
}
```

---

## Socket Location

```typescript
const socketPath = path.join(
  os.homedir(),
  '.pi/workers',
  `manager-${process.pid}.sock`
);
```

- Include PID to allow multiple managers
- Store in `~/.pi/workers/` for organization
- Clean up socket on manager exit

---

## Next Steps

1. **Create `extensions/worker-manager.ts`** - Start with Phase 1
2. **Create `bin/piworker`** - Worker wrapper script
3. **Test basic spawning** - `/spawn auth` works
4. **Test socket communication** - Worker connects to manager
5. **Iterate through phases** - Add features incrementally

---

## Open Questions

1. **Session migration** - How to handle different cwds in session file?
2. **Worker discovery** - Should manager persist registry across restarts?
3. **Error handling** - What if worker crashes? Manager crashes?
4. **Cleanup** - Auto-remove old worktrees? Keep them?
5. **Multiple repos** - One manager per repo, or global manager?

These will be resolved during implementation.
