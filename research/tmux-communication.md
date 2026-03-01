# Tmux Communication Research

## How to spawn tmux windows from a running process

### From inside tmux
```bash
tmux new-window -n "window-name" "command to run"
```

### From outside tmux (target specific session)
```bash
tmux new-window -t session-name -n "window-name" "command to run"
```

### Check if inside tmux
```bash
if [ -n "$TMUX" ]; then
  echo "Inside tmux"
fi
```

## Communication Options

### Option A: Unix Domain Sockets (Best for bidirectional)

**Manager creates socket:**
```typescript
import * as net from 'net';

const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received:', msg);
    
    // Send response
    socket.write(JSON.stringify({ status: 'ok' }));
  });
});

server.listen('/tmp/pi-manager.sock');
```

**Worker connects:**
```typescript
import * as net from 'net';

const client = net.connect('/tmp/pi-manager.sock', () => {
  client.write(JSON.stringify({
    type: 'create_worktree',
    branch: 'feature-x'
  }));
});

client.on('data', (data) => {
  const response = JSON.parse(data.toString());
  console.log('Response:', response);
  client.end();
});
```

### Option B: File-based Messages (Simplest, works everywhere)

**Manager watches directory:**
```typescript
import * as fs from 'fs';
import * as path from 'path';

const messagesDir = path.join(os.homedir(), '.pi/swarm/messages');
fs.mkdirSync(messagesDir, { recursive: true });

fs.watch(messagesDir, (eventType, filename) => {
  if (eventType === 'rename' && filename.endsWith('.json')) {
    const filePath = path.join(messagesDir, filename);
    const msg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Process message
    handleMessage(msg);
    
    // Delete after processing
    fs.unlinkSync(filePath);
  }
});
```

**Worker sends message:**
```typescript
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const messagesDir = path.join(os.homedir(), '.pi/swarm/messages');
const msgFile = path.join(messagesDir, `${randomUUID()}.json`);

fs.writeFileSync(msgFile, JSON.stringify({
  type: 'create_worktree',
  branch: 'feature-x',
  sessionId: 'abc123'
}));
```

### Option C: Named Pipes (FIFOs) - Unidirectional

**Create pipe:**
```bash
mkfifo ~/.pi/swarm/manager-commands
```

**Manager reads:**
```typescript
import * as fs from 'fs';

const pipe = fs.createReadStream(os.homedir() + '/.pi/swarm/manager-commands');
pipe.on('data', (data) => {
  const msg = JSON.parse(data.toString());
  handleMessage(msg);
});
```

**Worker writes:**
```bash
echo '{"type":"create_worktree","branch":"feature-x"}' > ~/.pi/swarm/manager-commands
```

### Option D: Tmux send-keys (Hacky, limited)

```bash
# Send command to another window
tmux send-keys -t worker-window "echo received" Enter

# Capture output from a pane
tmux capture-pane -t worker-window -p
```

**Not recommended:** Output capture is unreliable, no structured data.

## Recommended Architecture for Pi Worktree Manager

### Structure

```
Manager Terminal (pi running)
  ├── Unix socket server at ~/.pi/swarm/manager.sock
  ├── Spawns tmux windows
  └── Handles worktree creation/cleanup

Worker Terminals (pi in tmux windows)
  ├── Connect to manager socket
  ├── Send commands: create_worktree, status, etc.
  └── Receive responses: session restored, error, etc.
```

### Flow

1. **User in manager:** `/tmux auth`
   - Manager spawns: `tmux new-window -n auth "piworker auth"`
   - piworker script sets env var `PI_MANAGER_SOCKET=~/.pi/swarm/manager.sock`
   - Starts pi normally

2. **User in worker tmux:** `/worktree new-feature`
   - Worker extension sends to socket: `{ type: "create_worktree", branch: "new-feature", sessionId: "..." }`
   - Manager receives message
   - Manager kills worker pi process (how? store PIDs?)
   - Manager creates git worktree
   - Manager spawns new tmux window with pi in new worktree path
   - Manager restores session from sessionId

### Open Questions

1. **How does manager kill worker pi?**
   - Store PID mapping when spawning?
   - Send "shutdown" message to worker, worker exits gracefully?

2. **How to restore session in new worktree?**
   - SessionManager.setSessionFile() - but cwd changes
   - Fork session to new path?

3. **What if manager dies?**
   - Workers become orphaned
   - Need cleanup/reconnect logic?

4. **Should workers be aware they're workers?**
   - Yes - extension checks for PI_MANAGER_SOCKET env var
   - Changes behavior (shows different commands, connects to manager)

## Next Steps

1. Prototype simple socket communication (manager <-> worker)
2. Test tmux spawning with environment variables
3. Implement graceful worker shutdown
4. Handle session migration across worktrees
