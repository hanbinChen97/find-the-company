#!/usr/bin/env node
/**
 * Test Runner for Company API
 * 
 * Usage:
 *   node test-runner.js [options]
 *   
 * Options:
 *   --unit        Run unit tests only
 *   --e2e         Run E2E tests only  
 *   --integration Run integration tests only (requires API key)
 *   --apple       Run Apple company test specifically
 *   --watch       Run in watch mode
 *   --coverage    Run with coverage report
 */

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

// Default jest command
let jestArgs = ['--testTimeout=30000'];

// Parse arguments
if (args.includes('--unit')) {
  jestArgs.push('--testPathPattern=unit');
} else if (args.includes('--e2e')) {
  jestArgs.push('--testPathPattern=e2e');
} else if (args.includes('--integration')) {
  jestArgs.push('--testPathPattern=integration');
} else if (args.includes('--apple')) {
  jestArgs.push('--testNamePattern="apple company"');
}

if (args.includes('--watch')) {
  jestArgs.push('--watch');
}

if (args.includes('--coverage')) {
  jestArgs.push('--coverage');
}

if (args.includes('--verbose')) {
  jestArgs.push('--verbose');
}

// Check for API key when running integration tests
if (args.includes('--integration') || args.includes('--apple')) {
  if (!process.env.PERPLEXITY_API_KEY) {
    console.warn('⚠️  PERPLEXITY_API_KEY not found in environment variables.');
    console.warn('   Integration tests will be skipped automatically.');
    console.warn('   Set PERPLEXITY_API_KEY=your-key to run real API tests.\n');
  } else {
    console.log('✅ PERPLEXITY_API_KEY found - running real API tests\n');
  }
}

// Run Jest with pnpm
console.log('Running tests with args:', jestArgs.join(' '));

const jest = spawn('pnpm', ['exec', 'jest', ...jestArgs], {
  stdio: 'inherit',
  env: { ...process.env },
});

jest.on('close', (code) => {
  process.exit(code);
});

jest.on('error', (err) => {
  console.error('Failed to start Jest:', err);
  process.exit(1);
});