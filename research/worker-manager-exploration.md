# Worker Manager - Research & Exploration

Consolidated notes from brainstorming, research, and experimentation for the worker manager system.

---

## The Original Idea

Run multiple pi coding assistants in parallel, each in different git worktrees/branches, coordinated by a central manager.

**Key insight:** Manager doesn't need to run in tmux - it runs in a regular terminal, and spawns workers in separate iTerm windows.

---

## What We Researched

### 1. How Pi Spawns Processes (subagent-analysis.md)

Analyzed pi's `examples/extensions/subagent/`:

**Key learnings:**
- Pi uses `child_process.spawn()` for subprocess
- `--mode json` gives structured JSONL output
- `-p --no-session` for non-interactive execution
- Subprocesses are temporary (run and exit)

**Our difference:**
- We need long-running workers (not temporary)
- Workers are interactive (user chats with them)
- Bidirectional communication needed (workers send commands back)

---

### 2. Communication Methods (tmux-communication.md)

Evaluated options:

| Method | Pros | Cons | Decision |
|--------|------|------|----------|
| Unix sockets | Fast, bidirectional, reliable | - | ✅ **Chosen** |
| File messages | Simple, works everywhere | Slow, polling needed | ❌ |
| Named pipes | Simple | One-way only | ❌ |
| Tmux send-keys | - | Unreliable, hacky | ❌ |

**Decision:** Unix domain sockets for manager ↔ worker communication

---

### 3. Terminal Strategy

**Initial plan:** Use tmux for workers
**Problem:** Creates nested tmux complexity

**Final decision:** 
- Manager runs in regular iTerm terminal (no tmux)
- Workers spawn in separate iTerm windows
- Use AppleScript to control iTerm programmatically

**Why iTerm over tmux:**
- Simpler - no nesting
- Each worker is truly separate OS window
- Native macOS integration
- Can still set window size/position

**Trade-off:** macOS-only (acceptable for now)

---

### 4. Window Control Methods

**Session tracking options:**

| Method | Uniqueness | Reliability | Precision | Choice |
|--------|-----------|-------------|-----------|---------|
| Session name | ❌ User can rename | ❌ | Medium | ❌ |
| Window ID | ✅ Unique | ✅ | Low (closes all tabs) | ❌ |
| Session ID | ✅ Unique UUID | ✅ | ✅ Closes only session | ✅ **Chosen** |

**Decision:** Track iTerm session IDs (format: `w0t0p0:UUID`)

---

## Key Architectural Decisions

### 1. Dual-Mode Extension

One extension that detects mode via environment variable:

```typescript
const managerSocket = process.env.PI_MANAGER_SOCKET;

if (managerSocket) {
  // Worker mode - connect to manager
} else {
  // Manager mode - start socket server
}
```

**Why:** Simpler than two extensions, easy to maintain

---

### 2. Communication Protocol

**Socket-based request/response:**

```typescript
// Worker → Manager
{
  type: "create_worktree",
  branch: "new-feature",
  workerId: "auth"
}

// Manager → Worker
{
  status: "success",
  message: "Worktree created"
}
```

**Why:** Clean, extensible, supports multiple command types

---

### 3. Environment Variables for Discovery

Workers receive:
```bash
export PI_MANAGER_SOCKET=/tmp/manager.sock
export PI_WORKER_ID=auth
```

**Why:** Simple, works across process boundaries, no config files needed

---

### 4. Worker Lifecycle

```
Manager spawns worker
  ↓
Worker starts pi with env vars
  ↓
Worker extension detects PI_MANAGER_SOCKET
  ↓
Worker connects to manager socket
  ↓
Worker sends "register" message
  ↓
Manager tracks worker (session ID, PID)
  ↓
User interacts with worker
  ↓
Worker sends commands to manager
  ↓
Manager responds or takes action
```

---

## Experiments Built & Validated

All experiments in `/experiments/`:

### ✅ exp01-iterm-track-close.js
- Spawn iTerm windows via AppleScript
- Capture session IDs
- Close specific sessions programmatically
- Set window size/position

**Validates:** Can control iTerm from Node.js

---

### ✅ exp02-socket-{server,client}.js
- Bidirectional socket communication
- Request/response pattern
- JSON message passing
- Manager can reply to workers

**Validates:** Full two-way conversation possible

---

### ✅ exp03-env-pass.js
- Parent process spawns child
- Pass custom environment variables
- Child reads variables successfully

**Validates:** Can pass PI_MANAGER_SOCKET to workers

---

### ✅ exp04-worktree.js
- List git worktrees programmatically
- Create new worktree for branch
- Verify worktree exists
- Clean up worktree

**Validates:** Can manage git worktrees from code

---

## Helper Utilities Created

### experiments/lib/iterm-scripts.js

Reusable AppleScript generators:

```javascript
spawnWorkerScript(workerId, socketPath, options)
  // Creates iTerm window, sets env vars, runs pi
  
closeSessionScript(sessionId)
  // Closes specific iTerm session by ID
  
spawnTestWindowScript(name, commands)
  // General-purpose window spawning
```

**Why:** Keep AppleScript DRY, easier to maintain

---

## What We Learned

### 1. AppleScript is Weird but Works
- "English-like" syntax is verbose
- Can control iTerm programmatically
- Returns values (like session IDs)
- Alternative: JXA (JavaScript for Automation)

### 2. Unix Sockets are Simple
- `.sock` file is just an address
- Actual data flows in memory
- Fast, no disk I/O
- Perfect for local IPC

### 3. Session IDs are Reliable
- UUID-based, globally unique
- Survive window renames
- Precise targeting (session, not whole window)

### 4. Git Worktrees are Easy
- `git worktree add <path> -b <branch>`
- Creates full working copy
- Independent from main repo
- `git worktree remove <path>` to cleanup

---

## Features Beyond Worktrees

The system is called "worker manager" not "worktree manager" because workers can request many things:

**Implemented:**
- ✅ Spawn workers
- ✅ Socket communication

**Planned:**
- `/worktree <branch>` - Create worktree
- `/switch <branch>` - Switch to existing worktree  
- `/status` - List all workers
- `/close <worker>` - Shutdown worker

**Future possibilities:**
- `/fork <name>` - Fork session to new window (session-fork.md)
- `/merge <worker>` - Merge changes from worker
- `/run <command>` - Execute in worker
- `/broadcast <message>` - Send to all workers
- Cross-repo workers
- Remote workers (SSH)

---

## Implementation Plan

See `/plan/worker-manager-implementation.md` for full phased approach.

**Summary:**
1. **Phase 1:** Basic spawn + socket connection
2. **Phase 2:** Worker registry + tracking
3. **Phase 3:** Worktree creation feature
4. **Phase 4:** Session migration (optional)
5. **Phase 5:** Additional features

---

## Files to Build

```
extensions/
  └── worker-manager.ts      # Main dual-mode extension

bin/
  └── piworker              # Worker wrapper script
```

---

## Open Questions

1. **Session migration** - How to handle cwd changes in session files?
2. **Error recovery** - What if manager crashes? Worker crashes?
3. **Cleanup** - Auto-remove old worktrees or keep them?
4. **Multi-repo** - One manager per repo or global?
5. **Cross-platform** - Support tmux fallback for Linux?

To be resolved during implementation.

---

## References

**Experiments:** `/experiments/exp01-05`
**Implementation plan:** `/plan/worker-manager-implementation.md`
**Helper lib:** `/experiments/lib/iterm-scripts.js`

---

## Status

- ✅ Research complete
- ✅ Experiments validated
- ✅ Architecture decided
- ⏳ Implementation ready to start
