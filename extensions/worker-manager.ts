/**
 * Worker Manager Extension
 * 
 * Dual-mode extension that enables manager-worker communication:
 * - Manager mode: Create socket server, coordinate workers
 * - Worker mode: Connect to manager (manually via /connect), execute tasks
 * 
 * Detection:
 * - Manager: PI_WORKER_MANAGER=1 + PI_MANAGER_NAME
 * - Worker: PI_WORKER_ID (starts unconnected, use /connect to join manager)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Type } from '@sinclair/typebox';
import { Text } from '@mariozechner/pi-tui';

// Shared state
const workerRegistry = new Map<string, {
  socket: net.Socket;
  sessionId?: string;
  pid: number;
  connectedAt: number;
}>();

let firstWorkerConnected = false;

export default function(pi: ExtensionAPI) {
  const isManagerMode = process.env.PI_WORKER_MANAGER === '1';
  const isWorkerMode = process.env.PI_WORKER_ID !== undefined;
  const managerSocket = process.env.PI_MANAGER_SOCKET;
  
  if (isManagerMode) {
    // Manager mode
    initManager(pi);
  } else if (isWorkerMode) {
    // Worker mode
    if (managerSocket) {
      // Auto-connect if socket provided (backwards compatibility)
      initWorker(pi, managerSocket);
    } else {
      // Start in unconnected mode - use /connect command
      initWorkerUnconnected(pi);
    }
  }
  // Otherwise don't initialize - normal pi usage
}

function initManager(pi: ExtensionAPI) {
  const managerName = process.env.PI_MANAGER_NAME;
  
  if (!managerName) {
    console.error('[Worker Manager] PI_MANAGER_NAME not set - use: picode --manager --name <name>');
    return;
  }
  
  const socketDir = path.join(os.homedir(), '.pipi/sockets');
  const socketPath = path.join(socketDir, `${managerName}.sock`);
  
  // Create directory if needed
  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true });
  }
  
  // Remove old socket if exists
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  
  // Create socket server
  const server = net.createServer((socket) => {
    let buffer = '';
    
    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const msg = JSON.parse(line);
          
          if (msg.type === 'hello') {
            // Store worker in registry
            workerRegistry.set(msg.workerId, {
              socket,
              pid: msg.pid,
              connectedAt: Date.now()
            });
            
            // Persist connection event
            pi.appendEntry('worker-connected', {
              workerId: msg.workerId,
              pid: msg.pid,
              timestamp: Date.now()
            });
            
            // First worker? Give detailed explanation
            if (!firstWorkerConnected) {
              firstWorkerConnected = true;
              pi.sendMessage({
                customType: 'worker-connected',
                content: `Worker **${msg.workerId}** connected and ready.

**How to Use Workers:**

You can communicate with workers using the \`send_to_worker\` tool.

**When to Use Each Tool:**

**Normal tools** (bash, read, write, edit):
- For your work in this terminal
- Files you read/write are in your directory
- Commands you run execute here

**Worker communication** (send_to_worker):
- To send messages to worker agents
- Workers are independent pi instances in other terminals
- They can work on tasks in parallel

**Message Format:**

Worker messages appear as: **[Worker][${msg.workerId}]:**

**Example:**
\`\`\`
send_to_worker(workerId="${msg.workerId}", message="Please list files in the current directory")
\`\`\``,
                display: true
              });
            } else {
              // Subsequent workers - notify with example
              pi.sendMessage({
                customType: 'worker-connected',
                content: `Worker **${msg.workerId}** connected and ready.

You can communicate with this worker using:
\`\`\`
send_to_worker(workerId="${msg.workerId}", message="Your task here")
\`\`\``,
                display: true
              });
            }
          }
      
          if (msg.type === 'agent_message') {
            // Display the worker's message immediately
            pi.sendMessage({
              customType: 'worker-message',
              content: `**[Worker][${msg.from}]:**\n\n${msg.content}`,
              display: true
            }, {
              deliverAs: 'followUp',
              triggerTurn: true  // Trigger manager to respond
            });
          }
        } catch (err) {
          // Silently ignore parse errors
        }
      }
    });
    
    socket.on('close', () => {
      // Remove from registry
      for (const [id, worker] of workerRegistry.entries()) {
        if (worker.socket === socket) {
          workerRegistry.delete(id);
          
          // Persist disconnection event
          pi.appendEntry('worker-disconnected', {
            workerId: id,
            timestamp: Date.now()
          });
          
          // Notify manager LLM
          pi.sendMessage({
            customType: 'worker-disconnected',
            content: `Worker **${id}** has disconnected.`,
            display: true
          });
          
          break;
        }
      }
    });
    
    socket.on('error', (err) => {
      // Silently handle socket errors
    });
  });
  
  server.listen(socketPath);
  
  // Show status in footer
  const updateStatus = (ctx: any) => {
    const count = workerRegistry.size;
    const text = count > 0 
      ? `${managerName} (${count} worker${count === 1 ? '' : 's'})` 
      : `Manager: ${managerName}`;
    ctx.ui.setStatus('worker-manager', text);
  };
  
  pi.on('session_start', (_event, ctx) => {
    updateStatus(ctx);
  });
  
  pi.on('agent_start', (_event, ctx) => {
    updateStatus(ctx);
  });
  
  // Cleanup on shutdown
  pi.on('session_shutdown', (_event, ctx) => {
    ctx.ui.setStatus('worker-manager', undefined);
    
    // Close all worker sockets
    for (const [id, worker] of workerRegistry.entries()) {
      worker.socket.end();
    }
    workerRegistry.clear();
    
    server.close();
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });
  
  // Register worker communication tool (always available in manager mode)
  registerWorkerTools(pi);
  
  // Register /socket command
  registerSocketCommand(pi, socketPath, managerName);
  
  // Register /close command
  registerCloseCommand(pi);
}

function registerSocketCommand(pi: ExtensionAPI, socketPath: string, managerName: string) {
  pi.registerCommand('socket', {
    description: 'Show manager socket path',
    handler: async (args, ctx) => {
      const message = `**Manager Socket:**

\`${socketPath}\`

Workers can connect using:
\`\`\`bash
picode --worker --name <worker-name>
# Then inside worker:
/connect ${managerName}
\`\`\``;
      
      pi.sendMessage({
        customType: 'socket-info',
        content: message,
        display: true
      });
    }
  });
}

function registerCloseCommand(pi: ExtensionAPI) {
  pi.registerCommand('close', {
    description: 'Close a worker by ID',
    handler: async (args, ctx) => {
      const workerId = args.trim();
      
      if (!workerId) {
        ctx.ui.notify('Usage: /close <worker-id>', 'error');
        return;
      }
      
      const worker = workerRegistry.get(workerId);
      if (!worker) {
        const available = Array.from(workerRegistry.keys()).join(', ') || 'none';
        ctx.ui.notify(`Worker "${workerId}" not found. Active: ${available}`, 'error');
        return;
      }
      
      // Close the socket - worker will disconnect
      worker.socket.end();
      workerRegistry.delete(workerId);
      
      // Persist close event
      pi.appendEntry('worker-closed', {
        workerId,
        timestamp: Date.now()
      });
      
      // Inform LLM about closure
      pi.sendMessage({
        customType: 'worker-closed',
        content: `Worker **${workerId}** has been closed and is no longer available.`,
        display: true
      });
      
      ctx.ui.notify(`Closed worker: ${workerId}`, 'success');
    }
  });
}

function registerWorkerTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'send_to_worker',
    label: 'Send to Worker',
    description: 'Send a message to a specific worker agent',
    parameters: Type.Object({
      workerId: Type.String({ description: 'Worker ID to send to' }),
      message: Type.String({ description: 'Message content to send' })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { workerId, message } = params;
      
      const worker = workerRegistry.get(workerId);
      if (!worker) {
        const available = Array.from(workerRegistry.keys()).join(', ') || 'none';
        return {
          content: [{ 
            type: 'text', 
            text: `Worker "${workerId}" not found. Active workers: ${available}` 
          }],
          details: { error: 'Worker not found' }
        };
      }
      
      // Send message via socket
      const payload = {
        type: 'agent_message',
        from: 'manager',
        content: message
      };
      
      worker.socket.write(JSON.stringify(payload) + '\n');
      
      return {
        content: [{ 
          type: 'text', 
          text: `Sent to worker "${workerId}": ${message}` 
        }],
        details: { workerId, message }
      };
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('send_to_worker'));
      
      const workerId = args?.workerId;
      if (workerId) {
        text += ' ' + theme.fg('accent', workerId);
      }
      
      const message = args?.message;
      if (message) {
        const lines = message.split('\n');
        const maxLines = 10;
        const displayLines = lines.slice(0, maxLines);
        const remaining = lines.length - maxLines;
        
        text += '\n\n' + displayLines.map((line: string) => theme.fg('toolOutput', line)).join('\n');
        
        if (remaining > 0) {
          text += theme.fg('muted', `\n... (${remaining} more lines, ${lines.length} total)`);
        }
      }
      
      return new Text(text, 0, 0);
    }
  });
}

function initWorkerUnconnected(pi: ExtensionAPI) {
  const workerId = process.env.PI_WORKER_ID || 'unknown';
  
  // Shared connection state
  const workerState = {
    client: null as net.Socket | null,
    managerName: null as string | null
  };
  
  // Show unconnected status
  const updateStatus = (ctx: any) => {
    const status = workerState.managerName
      ? `Worker: ${workerId} → ${workerState.managerName}`
      : `Worker: ${workerId} (not connected)`;
    ctx.ui.setStatus('worker-manager', status);
  };
  
  pi.on('session_start', (_event, ctx) => {
    updateStatus(ctx);
  });
  
  pi.on('agent_start', (_event, ctx) => {
    updateStatus(ctx);
  });
  
  // Cleanup on shutdown
  pi.on('session_shutdown', (_event, ctx) => {
    ctx.ui.setStatus('worker-manager', undefined);
    if (workerState.client) {
      workerState.client.end();
    }
  });
  
  // Register send_to_manager tool (checks connection state when executed)
  registerWorkerToManagerToolWithState(pi, workerId, workerState);
  
  // Register /connect command
  registerConnectCommand(pi, workerId, workerState, updateStatus);
}

function initWorker(pi: ExtensionAPI, socketPath: string) {
  const workerId = process.env.PI_WORKER_ID || 'unknown';
  
  const client = net.connect(socketPath);
  
  // Register send_to_manager tool immediately (before connection)
  registerWorkerToManagerTool(pi, client, workerId);
  
  client.on('connect', () => {
    // Send hello message
    const hello = {
      type: 'hello',
      workerId: workerId,
      pid: process.pid,
      timestamp: Date.now()
    };
    
    client.write(JSON.stringify(hello) + '\n');
    
    // Educate worker LLM
    setTimeout(() => {
      pi.sendMessage({
        customType: 'worker-init',
        content: `Connected to manager as worker **${workerId}**!

**How to Communicate:**

You can communicate with the manager using the \`send_to_manager\` tool.

**When to Use Each Tool:**

**Normal tools** (bash, read, write, edit):
- For your work in this terminal
- Files you read/write are in your directory
- Commands you run execute here

**Manager communication** (send_to_manager):
- To send messages to the manager
- Report progress, ask questions, or request help

**Message Format:**

Manager messages appear as: **[Manager]:**

**Example:**
\`\`\`
send_to_manager(message="Task completed successfully")
\`\`\``,
        display: true
      });
    }, 100);
  });
  
  // Handle messages FROM manager
  let buffer = '';
  client.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const msg = JSON.parse(line);
        
        if (msg.type === 'agent_message') {
          // Note: We don't know manager name in auto-connect mode
          pi.sendMessage({
            customType: 'manager-message',
            content: `**[Manager]:**\n\n${msg.content}`,
            display: true
          }, {
            deliverAs: 'followUp',
            triggerTurn: true
          });
        }
      } catch (err) {
        // Silently ignore parse errors
      }
    }
  });
  
  client.on('error', (err) => {
    // Silently handle connection errors
  });
  
  client.on('close', () => {
    // Inform worker LLM that manager disconnected
    pi.sendMessage({
      customType: 'manager-disconnected',
      content: `Manager disconnected. I can no longer communicate with the manager.`,
      display: true
    });
  });
}

function registerWorkerToManagerTool(pi: ExtensionAPI, socket: net.Socket, workerId: string) {
  pi.registerTool({
    name: 'send_to_manager',
    label: 'Send to Manager',
    description: 'Send a message to the manager agent',
    parameters: Type.Object({
      message: Type.String({ description: 'Message to send to manager' })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { message } = params;
      
      const payload = {
        type: 'agent_message',
        from: workerId,
        content: message
      };
      
      // Send to manager via socket
      socket.write(JSON.stringify(payload) + '\n');
      
      return {
        content: [{ 
          type: 'text', 
          text: `Sent to manager: ${message}` 
        }],
        details: { message }
      };
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('send_to_manager'));
      
      const message = args?.message;
      if (message) {
        const lines = message.split('\n');
        const maxLines = 10;
        const displayLines = lines.slice(0, maxLines);
        const remaining = lines.length - maxLines;
        
        text += '\n\n' + displayLines.map((line: string) => theme.fg('toolOutput', line)).join('\n');
        
        if (remaining > 0) {
          text += theme.fg('muted', `\n... (${remaining} more lines, ${lines.length} total)`);
        }
      }
      
      return new Text(text, 0, 0);
    }
  });
}

function registerWorkerToManagerToolWithState(pi: ExtensionAPI, workerId: string, state: { client: net.Socket | null, managerName: string | null }) {
  pi.registerTool({
    name: 'send_to_manager',
    label: 'Send to Manager',
    description: 'Send a message to the manager agent',
    parameters: Type.Object({
      message: Type.String({ description: 'Message to send to manager' })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { message } = params;
      
      if (!state.client) {
        return {
          content: [{ 
            type: 'text', 
            text: 'Error: Not connected to any manager. Use /connect <manager-name> first.' 
          }],
          details: { error: 'Not connected' }
        };
      }
      
      const payload = {
        type: 'agent_message',
        from: workerId,
        content: message
      };
      
      // Send to manager via socket
      state.client.write(JSON.stringify(payload) + '\n');
      
      return {
        content: [{ 
          type: 'text', 
          text: `Sent to manager: ${message}` 
        }],
        details: { message }
      };
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('send_to_manager'));
      
      const message = args?.message;
      if (message) {
        const lines = message.split('\n');
        const maxLines = 10;
        const displayLines = lines.slice(0, maxLines);
        const remaining = lines.length - maxLines;
        
        text += '\n\n' + displayLines.map((line: string) => theme.fg('toolOutput', line)).join('\n');
        
        if (remaining > 0) {
          text += theme.fg('muted', `\n... (${remaining} more lines, ${lines.length} total)`);
        }
      }
      
      return new Text(text, 0, 0);
    }
  });
}

function registerConnectCommand(pi: ExtensionAPI, workerId: string, state: { client: net.Socket | null, managerName: string | null }, updateStatus: (ctx: any) => void) {
  pi.registerCommand('connect', {
    description: 'List or connect to a manager socket',
    handler: async (args, ctx) => {
      const managerName = args.trim();
      
      // No args? List available managers
      if (!managerName) {
        const socketDir = path.join(os.homedir(), '.pipi/sockets');
        
        if (!fs.existsSync(socketDir)) {
          ctx.ui.notify('No socket directory found', 'info');
          return;
        }
        
        const files = fs.readdirSync(socketDir);
        const sockets = files.filter(f => f.endsWith('.sock'));
        
        if (sockets.length === 0) {
          ctx.ui.notify('No manager sockets found', 'info');
          return;
        }
        
        let message = '**Available Manager Sockets:**\n\n';
        
        for (const file of sockets) {
          const socketPath = path.join(socketDir, file);
          const name = file.replace('.sock', '');
          
          // Check if socket is still valid (file exists)
          const exists = fs.existsSync(socketPath);
          const status = exists ? '✓' : '✗ (stale)';
          
          message += `- \`${name}\` ${status}\n`;
        }
        
        message += `\nUse \`/connect <manager-name>\` to connect to a manager.`;
        
        pi.sendMessage({
          customType: 'sockets-list',
          content: message,
          display: true
        });
        return;
      }
      
      // Check if already connected
      if (state.client && state.managerName) {
        if (state.managerName === managerName) {
          ctx.ui.notify(`Already connected to ${managerName}`, 'info');
        } else {
          ctx.ui.notify(`Already connected to ${state.managerName}`, 'error');
        }
        return;
      }
      
      // Connect to specified manager
      const socketPath = path.join(os.homedir(), '.pipi/sockets', `${managerName}.sock`);
      
      if (!fs.existsSync(socketPath)) {
        ctx.ui.notify(`Manager socket not found: ${managerName}`, 'error');
        return;
      }
      
      // Connect to manager
      const client = net.connect(socketPath);
      
      client.on('connect', () => {
        // Update state
        state.client = client;
        state.managerName = managerName;
        
        // Update status
        updateStatus(ctx);
        
        // Send hello message
        const hello = {
          type: 'hello',
          workerId: workerId,
          pid: process.pid,
          timestamp: Date.now()
        };
        
        client.write(JSON.stringify(hello) + '\n');
        
        // Notify success with education
        pi.sendMessage({
          customType: 'worker-connected',
          content: `Connected to manager **${managerName}**!

**How to Communicate:**

You can communicate with the manager using the \`send_to_manager\` tool.

**When to Use Each Tool:**

**Normal tools** (bash, read, write, edit):
- For your work in this terminal
- Files you read/write are in your directory
- Commands you run execute here

**Manager communication** (send_to_manager):
- To send messages to the manager
- Report progress, ask questions, or request help

**Message Format:**

Manager messages appear as: **[Manager][${managerName}]:**

**Example:**
\`\`\`
send_to_manager(message="Task completed successfully")
\`\`\``,
          display: true
        });
      });
      
      // Handle messages FROM manager
      let buffer = '';
      client.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const msg = JSON.parse(line);
            
            if (msg.type === 'agent_message') {
              pi.sendMessage({
                customType: 'manager-message',
                content: `**[Manager][${state.managerName}]:**\n\n${msg.content}`,
                display: true
              }, {
                deliverAs: 'followUp',
                triggerTurn: true
              });
            }
          } catch (err) {
            // Silently ignore parse errors
          }
        }
      });
      
      client.on('error', (err) => {
        ctx.ui.notify(`Connection error: ${err.message}`, 'error');
      });
      
      client.on('close', () => {
        // Clear state
        state.client = null;
        state.managerName = null;
        
        // Update status
        updateStatus(ctx);
        
        pi.sendMessage({
          customType: 'manager-disconnected',
          content: `Disconnected from manager **${managerName}**.`,
          display: true
        });
      });
    }
  });
}
