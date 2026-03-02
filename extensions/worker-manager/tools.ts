import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ManagerHandlers } from './handlers.js';
import { Type } from '@sinclair/typebox';
import { Text } from '@mariozechner/pi-tui';
import * as net from 'net';

export function registerWorkerTools(pi: ExtensionAPI, handlers: ManagerHandlers): void {
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
      
      const registry = handlers.getWorkerRegistry();
      const worker = registry.get(workerId);
      if (!worker) {
        const available = Array.from(registry.keys()).join(', ') || 'none';
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

export function registerWorkerToManagerTool(pi: ExtensionAPI, socket: net.Socket, workerId: string): void {
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

export function registerWorkerToManagerToolWithState(
  pi: ExtensionAPI, 
  workerId: string, 
  state: { client: net.Socket | null, managerName: string | null }
): void {
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
