import * as net from 'net';

export interface ServerHandlers {
  onData(socket: net.Socket, message: any): void;
  onClose(socket: net.Socket): void;
  onError(socket: net.Socket, error: Error): void;
}

export interface WorkerInfo {
  socket: net.Socket;
  sessionId?: string;
  pid: number;
  connectedAt: number;
}
