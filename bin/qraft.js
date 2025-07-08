#!/usr/bin/env node

// Binary entry point for the qraft CLI
// This file is referenced in package.json "bin" field

const path = require('path');
const fs = require('fs');

// Check if we're running from source or built
const distPath = path.join(__dirname, '..', 'dist', 'cli.js');
const srcPath = path.join(__dirname, '..', 'src', 'cli.ts');

if (fs.existsSync(distPath)) {
  // Running from built version
  require(distPath);
} else if (fs.existsSync(srcPath)) {
  // Running from source - use ts-node if available
  try {
    require('ts-node/register');
    require(srcPath);
  } catch (error) {
    console.error('Error: TypeScript source found but ts-node is not available.');
    console.error('Please run "npm run build" first or install ts-node.');
    process.exit(1);
  }
} else {
  console.error('Error: Neither built CLI nor source files found.');
  console.error('Please run "npm run build" first.');
  process.exit(1);
}
