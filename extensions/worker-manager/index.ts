/**
 * Worker Manager Extension
 * 
 * Dual-mode extension that enables manager-worker communication:
 * - Manager mode: Create socket server, coordinate workers
 * - Worker mode: Connect to manager (manually via /connect), execute tasks
 * 
 * Detection:
 * - Manager: PI_MANAGER_ID
 * - Worker: PI_WORKER_ID (starts unconnected, use /connect to join manager)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as net from 'net';
import { ManagerServer } from './server.js';
import { ManagerHandlers } from './handlers.js';
import { registerSocketCommand, registerCloseCommand, registerConnectCommand } from './commands.js';
import { registerWorkerTools, registerWorkerToManagerTool, registerWorkerToManagerToolWithState } from './tools.js';
import { getWorkerConnectedToManagerMessage, getManagerDisconnectedMessage } from './messages.js';
import { updateManagerStatus, updateWorkerStatus } from './status_bar.js';

export default function(pi: ExtensionAPI) {
  const isManagerMode = process.env.PI_MANAGER_ID !== undefined;
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
  const managerName = process.env.PI_MANAGER_ID;
  
  if (!managerName) {
    console.error('[Worker Manager] PI_MANAGER_ID not set - use: picode --name <name>');
    return;
  }
  
  // Create handlers and server
  const handlers = new ManagerHandlers(pi);
  const server = new ManagerServer(managerName, handlers);
  
  // Start server
  server.start();
  
  // Track latest context for status updates
  let latestCtx: any = null;
  
  // Show status in footer
  pi.on('session_start', (_event, ctx) => {
    latestCtx = ctx;
    updateManagerStatus(ctx, managerName, handlers);
  });
  
  pi.on('agent_start', (_event, ctx) => {
    latestCtx = ctx;
    updateManagerStatus(ctx, managerName, handlers);
  });
  
  // Set up registry change callback to update status immediately
  handlers.setOnRegistryChange(() => {
    if (latestCtx) {
      updateManagerStatus(latestCtx, managerName, handlers);
    }
  });
  
  // Cleanup on shutdown
  pi.on('session_shutdown', (_event, ctx) => {
    ctx.ui.setStatus('worker-manager', undefined);
    
    // Close all worker sockets
    const registry = handlers.getWorkerRegistry();
    for (const [id, worker] of registry.entries()) {
      worker.socket.end();
    }
    registry.clear();
    
    server.stop();
  });
  
  // Register worker communication tool (always available in manager mode)
  registerWorkerTools(pi, handlers);
  
  // Register /socket command
  registerSocketCommand(pi, server.getSocketPath(), managerName);
  
  // Register /close command
  registerCloseCommand(pi, handlers);
}

function initWorkerUnconnected(pi: ExtensionAPI) {
  const workerId = process.env.PI_WORKER_ID || 'unknown';
  
  // Shared connection state
  const workerState = {
    client: null as net.Socket | null,
    managerName: null as string | null
  };
  
  // Show unconnected status
  pi.on('session_start', (_event, ctx) => {
    updateWorkerStatus(ctx, workerId, workerState);
  });
  
  pi.on('agent_start', (_event, ctx) => {
    updateWorkerStatus(ctx, workerId, workerState);
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
  registerConnectCommand(pi, workerId, workerState, (ctx: any) => {
    updateWorkerStatus(ctx, workerId, workerState);
  });
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
        content: getWorkerConnectedToManagerMessage(workerId),
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
      content: getManagerDisconnectedMessage(),
      display: true
    });
  });
}
