#!/usr/bin/env node
/**
 * Child process for exp03
 * Reads and prints custom env vars
 */

console.log('--- Child Process Started ---\n');

console.log('Environment variables received:');
console.log(`  EXP_MODE   = ${process.env.EXP_MODE || '(not set)'}`);
console.log(`  EXP_SOCKET = ${process.env.EXP_SOCKET || '(not set)'}`);
console.log(`  EXP_ID     = ${process.env.EXP_ID || '(not set)'}`);

console.log('\n--- Child Process Ending ---');
