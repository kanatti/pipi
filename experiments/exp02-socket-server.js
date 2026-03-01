#!/usr/bin/env node
/**
 * Experiment 02: Unix Socket Communication (Server)
 * 
 * Tests:
 * - Can server receive a message AND send a response?
 * 
 * Run: node exp02-socket-server.js
 * Then in another terminal: node exp02-socket-client.js
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const socketPath = path.join(os.tmpdir(), 'exp02-test.sock');

console.log('=== Experiment 02: Socket Communication (Server) ===\n');

// Clean up any existing socket
if (fs.existsSync(socketPath)) {
  fs.unlinkSync(socketPath);
}

const server = net.createServer((socket) => {
  console.log('\n✓ Client connected!');
  
  socket.on('data', (data) => {
    console.log('\n📨 Received:');
    const msg = JSON.parse(data.toString());
    console.log(JSON.stringify(msg, null, 2));
    
    // Send response back
    const response = {
      status: 'success',
      received: msg.type,
      timestamp: new Date().toISOString(),
      message: 'Hello from server!'
    };
    
    console.log('\n📤 Sending response:');
    console.log(JSON.stringify(response, null, 2));
    
    socket.write(JSON.stringify(response));
  });
  
  socket.on('end', () => {
    console.log('\n✓ Client disconnected\n');
  });
});

server.listen(socketPath, () => {
  console.log(`✓ Server listening on: ${socketPath}`);
  console.log('\nWaiting for client...\n');
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  server.close();
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
  process.exit(0);
});
