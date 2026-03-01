#!/usr/bin/env node
/**
 * Experiment 02: Unix Socket Communication (Client)
 * 
 * Tests:
 * - Can client send a message AND receive a response?
 * 
 * Run: node exp02-socket-client.js
 */

import * as net from 'net';
import * as path from 'path';
import * as os from 'os';

const socketPath = path.join(os.tmpdir(), 'exp02-test.sock');

console.log('=== Experiment 02: Socket Communication (Client) ===\n');

const message = {
  type: 'ping',
  timestamp: new Date().toISOString()
};

console.log('📤 Sending:');
console.log(JSON.stringify(message, null, 2));
console.log();

const client = net.connect(socketPath, () => {
  console.log('✓ Connected!\n');
  client.write(JSON.stringify(message));
});

client.on('data', (data) => {
  console.log('📨 Received response:');
  const response = JSON.parse(data.toString());
  console.log(JSON.stringify(response, null, 2));
  console.log('\n✓ Bidirectional communication successful!\n');
  client.end();
});

client.on('error', (err) => {
  console.error('❌ Error:', err.message);
  console.error('\nMake sure server is running:');
  console.error('  node exp02-socket-server.js\n');
  process.exit(1);
});
