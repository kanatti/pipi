#!/usr/bin/env node
/**
 * Experiment 04: Git Worktree Operations
 * 
 * Tests:
 * - Can we list git worktrees?
 * - Can we create a new worktree?
 * - Can we verify it exists?
 * 
 * Prerequisites: Must be run from inside a git repository
 * 
 * Run: node exp04-worktree.js
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

console.log('=== Experiment 04: Git Worktree Operations ===\n');

// Helper to run git commands
function git(command) {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8' }).trim();
  } catch (err) {
    throw new Error(`Git command failed: ${err.message}`);
  }
}

// Test 1: Verify we're in a git repo
console.log('1. Verifying git repository...');
try {
  const root = git('rev-parse --show-toplevel');
  console.log(`✓ Git repo root: ${root}\n`);
} catch (err) {
  console.error('❌ Not in a git repository!');
  console.error('   Run this from inside a git repo\n');
  process.exit(1);
}

// Test 2: List current worktrees
console.log('2. Listing current worktrees...');
const worktrees = git('worktree list');
console.log(worktrees);
console.log();

// Test 3: Create a test worktree
console.log('3. Creating test worktree...');
const testBranch = `exp04-test-${Date.now()}`;
const worktreePath = path.join(os.tmpdir(), testBranch);

try {
  // Create worktree
  console.log(`   Branch: ${testBranch}`);
  console.log(`   Path: ${worktreePath}`);
  
  git(`worktree add ${worktreePath} -b ${testBranch}`);
  console.log('✓ Worktree created!\n');
  
  // Verify it exists
  console.log('4. Verifying worktree...');
  if (fs.existsSync(worktreePath)) {
    console.log('✓ Directory exists');
    console.log(`✓ Contents: ${fs.readdirSync(worktreePath).slice(0, 5).join(', ')}...\n`);
  } else {
    console.error('❌ Directory not found!');
  }
  
  // List worktrees again
  console.log('5. Updated worktree list:');
  console.log(git('worktree list'));
  console.log();
  
  // Cleanup
  console.log('6. Cleaning up...');
  git(`worktree remove ${worktreePath}`);
  git(`branch -D ${testBranch}`);
  console.log('✓ Test worktree removed\n');
  
} catch (err) {
  console.error('❌ Error:', err.message);
  
  // Attempt cleanup
  try {
    if (fs.existsSync(worktreePath)) {
      git(`worktree remove ${worktreePath} --force`);
    }
    git(`branch -D ${testBranch}`);
  } catch (cleanupErr) {
    console.error('⚠️  Manual cleanup may be needed');
  }
  
  process.exit(1);
}

console.log('✅ All tests passed!\n');
