import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ServerHandlers, WorkerInfo } from "./types.js";
import * as net from 'net';
import { 
  getFirstWorkerConnectedMessage, 
  getWorkerConnectedMessage, 
  getWorkerDisconnectedMessage,
  formatWorkerMessage 
} from './messages.js';

export class ManagerHandlers implements ServerHandlers {
  private firstWorkerConnected = false;
  private workerRegistry = new Map<string, WorkerInfo>();
  private onRegistryChange?: () => void;
  
  constructor(private pi: ExtensionAPI) {}
  
  setOnRegistryChange(callback: () => void) {
    this.onRegistryChange = callback;
  }
  
  onData(socket: net.Socket, message: any): void {
    if (message.type === 'hello') {
      this.handleHello(socket, message);
    } else if (message.type === 'agent_message') {
      this.handleAgentMessage(message);
    }
  }
  
  onClose(socket: net.Socket): void {
    // Remove from registry
    for (const [id, worker] of this.workerRegistry.entries()) {
      if (worker.socket === socket) {
        this.workerRegistry.delete(id);
        
        // Persist disconnection event
        this.pi.appendEntry('worker-disconnected', {
          workerId: id,
          timestamp: Date.now()
        });
        
        // Notify manager LLM
        this.pi.sendMessage({
          customType: 'worker-disconnected',
          content: getWorkerDisconnectedMessage(id),
          display: true
        });
        
        // Update status bar
        this.onRegistryChange?.();
        
        break;
      }
    }
  }
  
  onError(socket: net.Socket, error: Error): void {
    // Silently handle socket errors
  }
  
  getWorkerRegistry() {
    return this.workerRegistry;
  }
  
  private handleHello(socket: net.Socket, msg: any): void {
    // Store worker in registry
    this.workerRegistry.set(msg.workerId, {
      socket,
      pid: msg.pid,
      connectedAt: Date.now()
    });
    
    // Persist connection event
    this.pi.appendEntry('worker-connected', {
      workerId: msg.workerId,
      pid: msg.pid,
      timestamp: Date.now()
    });
    
    // Update status bar
    this.onRegistryChange?.();
    
    // First worker? Give detailed explanation
    if (!this.firstWorkerConnected) {
      this.firstWorkerConnected = true;
      this.pi.sendMessage({
        customType: 'worker-connected',
        content: getFirstWorkerConnectedMessage(msg.workerId),
        display: true
      });
    } else {
      // Subsequent workers - notify with example
      this.pi.sendMessage({
        customType: 'worker-connected',
        content: getWorkerConnectedMessage(msg.workerId),
        display: true
      });
    }
  }
  
  private handleAgentMessage(msg: any): void {
    // Display the worker's message immediately
    this.pi.sendMessage({
      customType: 'worker-message',
      content: formatWorkerMessage(msg.from, msg.content),
      display: true
    }, {
      deliverAs: 'followUp',
      triggerTurn: true  // Trigger manager to respond
    });
  }
}
