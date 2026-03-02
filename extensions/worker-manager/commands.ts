import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ManagerHandlers } from './handlers.js';
import { getSocketInfoMessage, getWorkerClosedMessage, getWorkerConnectedToManagerMessage, getManagerDisconnectedMessage } from './messages.js';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function registerSocketCommand(pi: ExtensionAPI, socketPath: string, managerName: string): void {
  pi.registerCommand('socket', {
    description: 'Show manager socket path',
    handler: async (args, ctx) => {
      pi.sendMessage({
        customType: 'socket-info',
        content: getSocketInfoMessage(socketPath, managerName),
        display: true
      });
    }
  });
}

export function registerCloseCommand(pi: ExtensionAPI, handlers: ManagerHandlers): void {
  pi.registerCommand('close', {
    description: 'Close a worker by ID',
    handler: async (args, ctx) => {
      const workerId = args.trim();
      
      if (!workerId) {
        ctx.ui.notify('Usage: /close <worker-id>', 'error');
        return;
      }
      
      const registry = handlers.getWorkerRegistry();
      const worker = registry.get(workerId);
      if (!worker) {
        const available = Array.from(registry.keys()).join(', ') || 'none';
        ctx.ui.notify(`Worker "${workerId}" not found. Active: ${available}`, 'error');
        return;
      }
      
      // Close the socket - worker will disconnect
      worker.socket.end();
      registry.delete(workerId);
      
      // Persist close event
      pi.appendEntry('worker-closed', {
        workerId,
        timestamp: Date.now()
      });
      
      // Inform LLM about closure
      pi.sendMessage({
        customType: 'worker-closed',
        content: getWorkerClosedMessage(workerId),
        display: true
      });
      
      ctx.ui.notify(`Closed worker: ${workerId}`, 'info');
    }
  });
}

export function registerConnectCommand(
  pi: ExtensionAPI, 
  workerId: string, 
  state: { client: net.Socket | null, managerName: string | null }, 
  updateStatus: (ctx: any) => void
): void {
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
          content: getWorkerConnectedToManagerMessage(workerId, managerName),
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
          content: getManagerDisconnectedMessage(managerName),
          display: true
        });
      });
    }
  });
}
