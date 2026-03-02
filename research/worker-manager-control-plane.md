# Worker Manager: Control Plane Architecture

## Overview

The worker-manager system uses **two types of socket messages**:

1. **Agent Messages** - LLM conversation (passed to Claude)
2. **Control Messages** - Extension-level commands (handled by extension, never seen by LLM)

This separation allows the manager to **control** workers (reset context, pause, etc.) without involving the LLM in operational details.

---

## Message Types

### Agent Message (LLM Conversation)

Used for normal LLM-to-LLM communication:

```json
{
  "type": "agent_message",
  "from": "manager" | "worker1",
  "content": "Please implement the auth module"
}
```

**Flow:**
```
Manager LLM → socket → Worker Extension → Worker LLM
Worker LLM → socket → Manager Extension → Manager LLM
```

**Rendered as:**
- Manager sees: `[Worker][worker1]: <content>`
- Worker sees: `[Manager][manager1]: <content>`

---

### Control Message (Extension Command)

Used for operational control:

```json
{
  "type": "control",
  "command": "clear_context" | "pause" | "resume" | "restart",
  "target": "worker1" | "all",
  "params": { /* optional */ }
}
```

**Flow:**
```
Manager Command → socket → Worker Extension → Action
                                            ↓
                                    (LLM never sees it)
```

**Key difference:** Control messages are **intercepted by the extension** and never delivered to the LLM.

---

## Architecture

### Manager Side

```typescript
// Send control message to one worker
function sendControl(workerId: string, command: string, params?: any) {
  const worker = workerRegistry.get(workerId);
  if (worker) {
    worker.socket.write(JSON.stringify({
      type: 'control',
      command,
      params
    }) + '\n');
  }
}

// Broadcast control to all workers
function broadcastControl(command: string, params?: any) {
  for (const [workerId, worker] of workerRegistry.entries()) {
    worker.socket.write(JSON.stringify({
      type: 'control',
      command,
      params
    }) + '\n');
  }
}
```

**Manager tool:**
```typescript
pi.registerTool({
  name: 'control_worker',
  label: 'Control Worker',
  description: 'Send control commands to workers (clear context, pause, resume, etc.)',
  parameters: Type.Object({
    workerId: Type.String({ 
      description: 'Worker ID to control, or "all" for all workers' 
    }),
    command: Type.Union([
      Type.Literal('clear_context'),
      Type.Literal('pause'),
      Type.Literal('resume'),
      Type.Literal('restart')
    ], {
      description: 'Control command to execute'
    }),
    params: Type.Optional(Type.Object({}, { 
      description: 'Optional parameters for the command',
      additionalProperties: true 
    }))
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const { workerId, command, params: cmdParams } = params;
    
    if (workerId === 'all') {
      // Broadcast to all workers
      broadcastControl(command, cmdParams);
      return {
        content: [{ 
          type: 'text', 
          text: `Sent ${command} to all workers` 
        }]
      };
    } else {
      // Send to specific worker
      sendControl(workerId, command, cmdParams);
      return {
        content: [{ 
          type: 'text', 
          text: `Sent ${command} to worker ${workerId}` 
        }]
      };
    }
  }
});
```

---

### Worker Side

```typescript
// Handle incoming messages
client.on('data', (data) => {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const msg = JSON.parse(line);
      
      // Control messages - handled by extension
      if (msg.type === 'control') {
        handleControlMessage(msg, ctx);
        continue; // Don't pass to LLM
      }
      
      // Agent messages - pass to LLM
      if (msg.type === 'agent_message') {
        pi.sendMessage({
          customType: 'manager-message',
          content: `**[Manager][${managerName}]:**\n\n${msg.content}`,
          display: true
        }, {
          deliverAs: 'followUp',
          triggerTurn: true
        });
      }
    } catch (err) {
      // Parse error
    }
  }
});

// Control message handler
function handleControlMessage(msg: any, ctx: any) {
  switch (msg.command) {
    case 'clear_context':
      ctx.newSession();
      ctx.ui.notify('Context cleared by manager', 'info');
      break;
      
    case 'pause':
      // Stop processing new messages
      workerState.paused = true;
      ctx.ui.notify('Paused by manager', 'warning');
      break;
      
    case 'resume':
      workerState.paused = false;
      ctx.ui.notify('Resumed by manager', 'success');
      break;
      
    // Add more commands as needed
  }
}
```

---

## Why This Separation?

### Without Control Plane (Problem)

Manager wants to clear worker context:

```
Manager: "Please clear your context"
Worker: "I cannot clear my own context. That would require..."
```

❌ LLM doesn't have operational control
❌ Requires tool implementation for every operation
❌ LLM might refuse or misunderstand

### With Control Plane (Solution)

Manager LLM uses the `control_worker` tool:

```typescript
control_worker(workerId: "worker1", command: "clear_context")
```

**What happens:**
1. Tool sends control message via socket (not agent_message)
2. Worker extension receives it
3. Extension calls `ctx.newSession()`
4. Worker LLM context is cleared
5. ✅ Done - worker LLM never sees the control message

**Key insight:** Control messages bypass the worker LLM entirely.

---

## Manager Education

The manager LLM needs to be educated about the `control_worker` tool:

```markdown
**Worker Control:**

You can control workers using the `control_worker` tool.

**Available Commands:**

- `clear_context` - Reset worker's conversation history
- `pause` - Stop worker from processing messages
- `resume` - Resume a paused worker
- `restart` - Clear and reinitialize worker

**When to Use:**

- Worker is confused or off-track → clear_context
- Worker needs to start fresh on new task → clear_context
- Worker finished task, prepare for next → clear_context
- Need to temporarily stop worker → pause/resume

**Examples:**

```
control_worker(workerId="worker1", command="clear_context")
control_worker(workerId="all", command="clear_context")
control_worker(workerId="worker2", command="pause")
```

**Note:** Control commands are handled by the extension, not the worker LLM.
```

---

## Implemented Control Commands

### `clear_context` - Reset Worker Context

**LLM usage:**
```typescript
control_worker(workerId="worker1", command="clear_context")
```

**Control message:**
```json
{
  "type": "control",
  "command": "clear_context"
}
```

**Worker action:**
```typescript
await ctx.newSession(); // Start fresh session
ctx.ui.notify('Context cleared by manager', 'info');
```

---

## Planned Control Commands

### `pause` - Pause Worker

Stop worker from processing new messages.

**LLM usage:**
```typescript
control_worker(workerId="worker1", command="pause")
```

**Control message:**
```json
{
  "type": "control",
  "command": "pause"
}
```

### `resume` - Resume Worker

Resume processing messages.

**LLM usage:**
```typescript
control_worker(workerId="worker1", command="resume")
```

**Control message:**
```json
{
  "type": "control",
  "command": "resume"
}
```

### `inject_context` - Inject Background Context

Add background information to worker without triggering response.

**LLM usage:**
```typescript
control_worker(
  workerId="worker1", 
  command="inject_context",
  params: { content: "The API endpoint is /api/v2/users" }
)
```

**Control message:**
```json
{
  "type": "control",
  "command": "inject_context",
  "params": {
    "content": "The API endpoint is /api/v2/users"
  }
}
```

### `restart` - Restart Worker Session

Clear and reinitialize with original setup.

**LLM usage:**
```typescript
control_worker(workerId="worker1", command="restart")
```

**Control message:**
```json
{
  "type": "control",
  "command": "restart"
}
```

---

## Benefits

✅ **Operational Control** - Manager controls workers at system level
✅ **Clean Separation** - Chat vs control are distinct
✅ **No LLM Confusion** - Control messages never reach worker LLM
✅ **Extensible** - Easy to add new control commands
✅ **LLM Intelligence** - Manager LLM decides when to use controls
✅ **Reliable** - Extension handles it, not worker LLM interpretation
✅ **Automation** - Manager can orchestrate complex workflows autonomously

## Why Tool Instead of User Command?

### Tool Approach (✅ Recommended)
```typescript
// Manager LLM decides
control_worker(workerId="worker1", command="clear_context")
```

**Benefits:**
- Manager LLM can decide when workers need reset
- Can be part of automated workflows
- LLM has full context to make decision
- Can control multiple workers in sequence
- No manual intervention needed

**Example flow:**
1. Manager asks worker1 to implement feature
2. Worker1 gets confused, goes off track
3. Manager detects this from responses
4. Manager calls `control_worker(worker1, "clear_context")`
5. Manager re-explains task with better context
6. ✅ Fully automated recovery

### Command Approach (❌ Less Flexible)
```bash
# User manually types
/new worker1
```

**Drawbacks:**
- User must manually detect problems
- Interrupts workflow
- Can't be automated
- Manager LLM can't orchestrate
- Requires constant human supervision

---

## Message Flow Diagram

```
┌─────────────────────────────────────────────────┐
│ Manager Terminal                                │
│                                                 │
│ Manager LLM decides: "Worker1 is confused,      │
│                       need to reset context"    │
│   ↓                                             │
│ LLM calls tool:                                 │
│   control_worker(workerId="worker1",            │
│                  command="clear_context")       │
│   ↓                                             │
│ Extension sends control message via socket      │
└───────────────────────┬─────────────────────────┘
                        │
                        │ {"type": "control", "command": "clear_context"}
                        │
                        ↓
┌─────────────────────────────────────────────────┐
│ Worker Terminal (worker1)                       │
│                                                 │
│ Extension receives message                      │
│   ↓                                             │
│ if (msg.type === 'control')                     │
│   handleControlMessage()                        │
│   ↓                                             │
│   ctx.newSession() ← Extension action           │
│   ↓                                             │
│ ✓ Context cleared                               │
│                                                 │
│ (Worker LLM never sees the control message)     │
└─────────────────────────────────────────────────┘
```

---

## Comparison: Agent vs Control Messages

| Aspect | Agent Message | Control Message |
|--------|---------------|-----------------|
| **Purpose** | LLM conversation | Operational control |
| **Sender** | LLM (via tools) | User (via commands) |
| **Receiver** | LLM | Extension |
| **Visibility** | Shown to LLM | Hidden from LLM |
| **Format** | Markdown chat | JSON command |
| **Example** | "Please implement X" | "clear_context" |
| **Reliability** | Depends on LLM | Guaranteed |

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] `control_worker` tool registration on manager
- [ ] Control message routing in worker socket handler
- [ ] `handleControlMessage()` function on worker side
- [ ] Broadcast helper function on manager side
- [ ] Manager LLM education (explain control_worker tool)

### Phase 2: Core Control Commands
- [ ] `clear_context` - Reset worker context
- [ ] `pause` - Stop worker processing
- [ ] `resume` - Resume worker processing

### Phase 3: Advanced Control
- [ ] `inject_context` - Add background info without triggering response
- [ ] `restart` - Clear and reinitialize worker
- [ ] `set_mode` - Change worker behavior mode
- [ ] Worker status reporting back to manager

### Phase 4: UI/UX
- [ ] Show control actions in manager UI
- [ ] Worker notifications when controlled
- [ ] Control history/audit log

---

## Related Docs

- Implementation: `plan/worker-manager/implementation.md`
- Manual Connection: `plan/worker-manager/manual-connection.md`
- Socket Architecture: (this document)
