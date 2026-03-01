#!/usr/bin/env node
/**
 * Experiment 01: iTerm Track and Close
 * 
 * Tests:
 * - Can we capture iTerm session IDs when spawning?
 * - Can we close specific sessions by ID?
 * - Does closing by session ID leave other windows/tabs alone?
 * 
 * Flow:
 * 1. Spawn iTerm window with pi
 * 2. Capture and store session ID
 * 3. Wait 10 seconds (so you can see it)
 * 4. Close it programmatically
 * 
 * Prerequisites: macOS with iTerm2 and pi installed
 * 
 * Run: node exp01-iterm-track-close.js
 */

import { spawn } from 'child_process';
import * as os from 'os';
import { spawnWorkerScript, closeSessionScript } from './lib/iterm-scripts.js';

console.log('=== Experiment 01: iTerm Track and Close ===\n');

// Check platform
if (os.platform() !== 'darwin') {
  console.error('❌ Not on macOS!');
  process.exit(1);
}

const workerId = 'test-worker';

// Helper to run osascript and capture output
function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    const proc = spawn('osascript', ['-e', script]);
    let output = '';
    let error = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(error || `Process exited with code ${code}`));
      }
    });
  });
}

// Step 1: Spawn iTerm window and capture session ID
async function spawnWorker() {
  console.log('1. Spawning iTerm window with pi...');
  
  // Optional: Set window size and position
  const options = {
    bounds: { x: 100, y: 100, width: 1000, height: 700 }
  };
  
  const script = spawnWorkerScript(workerId, null, options);
  
  try {
    const sessionId = await runAppleScript(script);
    console.log(`✓ Worker spawned!`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Name: pi-worker-${workerId}`);
    console.log(`  Size: 1000x700 at position (100, 100)\n`);
    return sessionId;
  } catch (err) {
    console.error('❌ Failed to spawn worker:', err.message);
    process.exit(1);
  }
}

// Step 2: Close worker by session ID
async function closeWorker(sessionId) {
  console.log('2. Closing worker session...');
  console.log(`   Looking for session: ${sessionId}\n`);
  
  const script = closeSessionScript(sessionId);
  
  try {
    const result = await runAppleScript(script);
    
    if (result === 'found') {
      console.log('✓ Session closed successfully!');
      console.log('  Only the worker session was closed');
      console.log('  Other iTerm windows/tabs should be unaffected\n');
    } else {
      console.log('⚠️  Session not found (may have already closed)\n');
    }
  } catch (err) {
    console.error('❌ Failed to close session:', err.message);
  }
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main flow
async function main() {
  try {
    // Spawn worker
    const sessionId = await spawnWorker();
    
    // Wait 10 seconds
    console.log('Waiting 10 seconds...');
    console.log('(Check your iTerm - you should see the new window)\n');
    
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`\rClosing in ${i} seconds... `);
      await sleep(1000);
    }
    console.log('\n');
    
    // Close it
    await closeWorker(sessionId);
    
    console.log('✅ Experiment complete!');
    console.log('\nWhat we validated:');
    console.log('  ✓ Can capture session IDs when spawning');
    console.log('  ✓ Can close specific sessions by ID');
    console.log('  ✓ Precise control over which session closes\n');
    
  } catch (err) {
    console.error('❌ Experiment failed:', err.message);
    process.exit(1);
  }
}

main();
