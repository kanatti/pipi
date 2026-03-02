import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LineBufferedParser } from './protocol.js';
import type { ServerHandlers } from './types.js';

export class ManagerServer {
  private server: net.Server | null = null;
  private socketPath: string;
  
  constructor(
    private managerName: string,
    private handlers: ServerHandlers
  ) {
    const socketDir = path.join(os.homedir(), '.pipi/sockets');
    this.socketPath = path.join(socketDir, `${managerName}.sock`);
  }
  
  start(): void {
    const socketDir = path.dirname(this.socketPath);
    
    // Create directory if needed
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
    }
    
    // Remove old socket if exists
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
    
    // Create socket server
    this.server = net.createServer((socket) => {
      const parser = new LineBufferedParser();
      
      socket.on('data', (data) => {
        const lines = parser.feed(data);
        
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            this.handlers.onData(socket, msg);
          } catch (err) {
            // Silently ignore parse errors
          }
        }
      });
      
      socket.on('close', () => {
        this.handlers.onClose(socket);
      });
      
      socket.on('error', (err) => {
        this.handlers.onError(socket, err);
      });
    });
    
    this.server.listen(this.socketPath);
  }
  
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
  }
  
  getSocketPath(): string {
    return this.socketPath;
  }
}
