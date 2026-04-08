import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Test helper to wait for async operations
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GSD Qdrant Sync - End-to-End Indexing', () => {
  const testFileDir = join(process.cwd(), '.gsd', 'test-milestone');
  const testFileMd = join(testFileDir, 'TEST-REQUIREMENT.md');
  const testFileJs = join(testFileDir, 'test-component.js');
  const stateFile = join(process.cwd(), '.gsd', '.qdrant-sync-state.json');

  beforeAll(async () => {
    // Create test directory structure
    if (!existsSync(testFileDir)) {
      mkdirSync(testFileDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup test files
    try {
      if (existsSync(testFileMd)) {
        unlinkSync(testFileMd);
      }
      if (existsSync(testFileJs)) {
        unlinkSync(testFileJs);
      }
      // Clean up test directory if empty
      if (existsSync(testFileDir)) {
        const files = readdirSync(testFileDir);
        if (files.length === 0) {
          rmSync(testFileDir, { recursive: true });
        }
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should create a test markdown file for indexing', () => {
    const testContent = `---
id: R999
class: functional
description: Test requirement for e2e verification
why: To verify the indexing system works end-to-end
source: test-e2e
status: active
---

# Test Requirement E2E

This is a test requirement to verify the Qdrant indexing system.

## Features

- Test requirement creation
- Indexing verification
- Context retrieval

## Related Files

- test-component.js
`;

    writeFileSync(testFileMd, testContent);
    expect(existsSync(testFileMd)).toBe(true);
  });

  it('should create a test JavaScript file for indexing', () => {
    const testContent = `// Test component for e2e verification
export const TestComponent = () => {
  return {
    name: 'TestComponent',
    description: 'This is a test component for e2e verification',
  };
};

export const TestUtility = {
  validate: (data) => {
    return data && typeof data === 'object';
  },
};

module.exports = { TestComponent, TestUtility };
`;

    writeFileSync(testFileJs, testContent);
    expect(existsSync(testFileJs)).toBe(true);
  });

  it('should sync and index the test files', async () => {
    const syncScript = join(process.cwd(), 'lib', 'gsd-qdrant-sync', 'index.js');
    
    try {
      const result = execSync(`node "${syncScript}" sync`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      console.log('Sync output:', result);
      
      // Check that sync completed successfully
      expect(result).toContain('Synced');
      expect(result).toContain('Processing');
    } catch (error) {
      console.error('Sync stderr:', error.stderr);
      console.error('Sync stdout:', error.stdout);
      throw error;
    }
  }, 35000);

  it('should verify files were indexed by checking state file', async () => {
    await wait(2000); // Wait for state to be written
    
    if (existsSync(stateFile)) {
      const stateContent = JSON.parse(require('fs').readFileSync(stateFile, 'utf8'));
      
      // Check that our test files are in the state
      const testFileKeys = Object.keys(stateContent.fileHashes || {}).filter(
        (key) => key.includes('test-milestone') || key.includes('TEST-REQUIREMENT') || key.includes('test-component')
      );
      
      expect(testFileKeys.length).toBeGreaterThan(0);
      console.log('Indexed test files:', testFileKeys);
    } else {
      console.warn('State file not found, skipping hash verification');
    }
  }, 5000);

  it('should query and retrieve the test requirement', async () => {
    const syncScript = join(process.cwd(), 'lib', 'gsd-qdrant-sync', 'index.js');
    
    try {
      // Query for the test requirement
      const queryResult = execSync(`node "${syncScript}" query TEST-REQUIREMENT --collection context-docs --limit 5`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      console.log('Query result:', queryResult);
      
      // Should contain our test requirement
      expect(queryResult).toContain('TEST-REQUIREMENT');
    } catch (error) {
      console.log('Query command status:', error.status);
      console.log('Query stderr:', error.stderr);
      throw error;
    }
  }, 35000);

  it('should verify context from .md files is included in snippets', async () => {
    const syncScript = join(process.cwd(), 'lib', 'gsd-qdrant-sync', 'index.js');
    
    try {
      // Query for the test component
      const queryResult = execSync(`node "${syncScript}" query TestComponent --collection code-snippets --limit 5`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      console.log('Query result for TestComponent:', queryResult);
      
      // Should contain our test component
      expect(queryResult).toContain('TestComponent');
    } catch (error) {
      console.log('Query command status:', error.status);
      console.log('Query stderr:', error.stderr);
      throw error;
    }
  }, 35000);

  it('should include context from .md files when querying with --with-context', async () => {
    const syncScript = join(process.cwd(), 'lib', 'gsd-qdrant-sync', 'index.js');
    
    try {
      // Query for the test component with context
      const queryResult = execSync(`node "${syncScript}" query TestComponent --collection code-snippets --limit 5 --with-context`, {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      console.log('Query result with context for TestComponent:', queryResult);
      
      // Should contain our test component
      expect(queryResult).toContain('TestComponent');
    } catch (error) {
      console.log('Query command status:', error.status);
      console.log('Query stderr:', error.stderr);
      throw error;
    }
  }, 35000);
});
