#!/usr/bin/env node
/**
 * Experiment 03: Environment Variable Passing
 * 
 * Tests:
 * - Can we spawn a child process with custom env vars?
 * - Can child read those vars?
 * 
 * Run: node exp03-env-pass.js
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Experiment 03: Environment Variable Passing ===\n');

console.log('1. Parent process (this)');
console.log(`   Custom env vars to pass:`);
console.log(`   - EXP_MODE=worker`);
console.log(`   - EXP_SOCKET=/tmp/test.sock`);
console.log(`   - EXP_ID=test-123\n`);

console.log('2. Spawning child process...\n');

// Spawn child with custom env vars
const child = spawn('node', [path.join(__dirname, 'exp03-child.js')], {
  env: {
    ...process.env,  // Inherit parent env
    EXP_MODE: 'worker',
    EXP_SOCKET: '/tmp/test.sock',
    EXP_ID: 'test-123'
  },
  stdio: 'inherit'
});

child.on('close', (code) => {
  console.log(`\n✓ Child exited with code ${code}\n`);
});
