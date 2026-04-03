#!/usr/bin/env node

/**
 * AST Parser for JavaScript/TypeScript
 * 
 * Parses source files using AST to extract functions, classes, and modules.
 * Tracks line numbers and source file paths.
 * Calculates metrics (lines, complexity).
 */

const fs = require('fs');
const path = require('path');

// Babel parser for JavaScript/TypeScript
let babylon;
try {
  babylon = require('@babel/parser');
} catch (e) {
  // Fallback to acorn if babel is not available
  try {
    babylon = require('acorn').parse;
  } catch (e2) {
    console.error('Error: Neither @babel/parser nor acorn found');
    console.error('Install one of these dependencies:');
    console.error('  npm install @babel/parser');
    console.error('  npm install acorn');
    process.exit(1);
  }
}

/**
 * Parse a source file and extract AST nodes
 */
function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);
  
  let parserOptions = {
    sourceType: 'module',
    ecmaVersion: 2022,
    locations: true,
    ranges: true,
    comments: true,
    tokens: true
  };
  
  if (ext === '.ts') {
    parserOptions = {
      ...parserOptions,
      plugins: [['typescript', { isModule: true }]],
      ecmaFeatures: { jsx: true }
    };
  }
  
  try {
    const ast = babylon.parse(content, parserOptions);
    // Babel returns a File node with a 'program' property containing the actual AST
    return ast.program || ast;
  } catch (e) {
    console.error(`Error parsing ${filePath}: ${e.message}`);
    return null;
  }
}

/**
 * Extract function declarations from AST
 */
function extractFunctions(node, filePath) {
  const functions = [];
  
  if (!node) return functions;
  
  function traverse(n) {
    if (!n) return;
    
    // Function declarations
    if (n.type === 'FunctionDeclaration' || n.type === 'AsyncFunctionDeclaration') {
      functions.push({
        type: 'function',
        name: n.id?.name || null,
        isAnonymous: !n.id,
        line: n.loc?.start?.line || 0,
        endLine: n.loc?.end?.line || 0,
        params: n.params?.length || 0,
        isAsync: n.async || false,
        isGenerator: n.generator || false,
        sourceFile: filePath
      });
    }
    
    // Function expressions
    if (n.type === 'FunctionExpression' || n.type === 'AsyncFunctionExpression') {
      functions.push({
        type: 'function',
        name: n.id?.name || 'anonymous',
        isAnonymous: !n.id,
        line: n.loc?.start?.line || 0,
        endLine: n.loc?.end?.line || 0,
        params: n.params?.length || 0,
        isAsync: n.async || false,
        isGenerator: n.generator || false,
        sourceFile: filePath
      });
    }
    
    // Arrow functions
    if (n.type === 'ArrowFunctionExpression') {
      functions.push({
        type: 'function',
        name: 'arrow',
        isAnonymous: true,
        line: n.loc?.start?.line || 0,
        endLine: n.loc?.end?.line || 0,
        params: n.params?.length || 0,
        isAsync: n.async || false,
        isGenerator: n.generator || false,
        sourceFile: filePath
      });
    }
    
    // Recurse into children
    for (const key in n) {
      if (['loc', 'start', 'end', 'range', 'type'].includes(key)) continue;
      const child = n[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach(c => traverse(c));
        } else {
          traverse(child);
        }
      }
    }
  }
  
  // Handle File node (babel) or direct node
  const root = node.type === 'File' ? node.body : node;
  if (Array.isArray(root)) {
    root.forEach(n => traverse(n));
  } else {
    traverse(root);
  }
  
  return functions;
}

/**
 * Extract class declarations from AST
 */
function extractClasses(node, filePath) {
  const classes = [];
  
  if (!node || !node.body) return classes;
  
  function traverse(n, parent = null) {
    if (!n) return;
    
    // Class declarations
    if (n.type === 'ClassDeclaration') {
      classes.push({
        type: 'class',
        name: n.id?.name || null,
        isAnonymous: !n.id,
        line: n.loc?.start?.line || 0,
        endLine: n.loc?.end?.line || 0,
        isAbstract: n.abstract || false,
        isAsync: n.async || false,
        hasConstruct: n.body?.body?.some(m => m.type === 'Constructor') || false,
        sourceFile: filePath
      });
    }
    
    // Class expressions
    if (n.type === 'ClassExpression') {
      classes.push({
        type: 'class',
        name: n.id?.name || 'anonymous',
        isAnonymous: !n.id,
        line: n.loc?.start?.line || 0,
        endLine: n.loc?.end?.line || 0,
        isAbstract: n.abstract || false,
        isAsync: n.async || false,
        hasConstruct: n.body?.body?.some(m => m.type === 'Constructor') || false,
        sourceFile: filePath
      });
    }
    
    // Recurse into children
    for (const key in n) {
      if (['loc', 'start', 'end', 'range'].includes(key)) continue;
      const child = n[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach(c => traverse(c, n));
        } else {
          traverse(child, n);
        }
      }
    }
  }
  
  traverse(node);
  return classes;
}

/**
 * Extract module exports from AST
 */
function extractExports(node, filePath) {
  const exports = [];
  
  if (!node || !node.body) return exports;
  
  function traverse(n, parent = null) {
    if (!n) return;
    
    // Export declarations
    if (n.type === 'ExportNamedDeclaration') {
      exports.push({
        type: 'export',
        kind: n.exportKind || 'value',
        isType: n.exportKind === 'type',
        sourceFile: filePath
      });
    }
    
    // Export default declarations
    if (n.type === 'ExportDefaultDeclaration') {
      exports.push({
        type: 'export-default',
        declarationType: n.declaration?.type || 'unknown',
        sourceFile: filePath
      });
    }
    
    // Export all declarations
    if (n.type === 'ExportAllDeclaration') {
      exports.push({
        type: 'export-all',
        sourceFile: filePath
      });
    }
    
    // Recurse into children
    for (const key in n) {
      if (['loc', 'start', 'end', 'range'].includes(key)) continue;
      const child = n[key];
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          child.forEach(c => traverse(c, n));
        } else {
          traverse(child, n);
        }
      }
    }
  }
  
  traverse(node);
  return exports;
}

/**
 * Calculate code metrics
 */
function calculateMetrics(node, content) {
  const lines = content.split('\n').length;
  
  // Calculate cyclomatic complexity (simplified)
  let complexity = 1;
  const complexityKeywords = ['if', 'for', 'while', 'switch', 'case', 'catch', '&&', '||', '?', ':'];
  const contentLower = content.toLowerCase();
  complexityKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^$[\]\\]/g, '\\$&')}\\b`, 'g');
    complexity += (contentLower.match(regex) || []).length;
  });
  
  return {
    lines,
    complexity,
    estimatedTime: Math.max(1, Math.ceil(complexity * 0.5)) // hours
  };
}

/**
 * Main extraction function
 */
function extractSnippets(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const ast = parseFile(filePath);
  
  if (!ast) {
    return {
      functions: [],
      classes: [],
      exports: [],
      metrics: { lines: 0, complexity: 0 }
    };
  }
  
  const functions = extractFunctions(ast, filePath);
  const classes = extractClasses(ast, filePath);
  const exports = extractExports(ast, filePath);
  const metrics = calculateMetrics(ast, content);
  
  return {
    functions,
    classes,
    exports,
    metrics,
    sourceFile: filePath
  };
}

/**
 * Process multiple files
 */
function processFiles(filePaths) {
  const results = [];
  
  for (const filePath of filePaths) {
    try {
      const result = extractSnippets(filePath);
      results.push(result);
      console.log(`✅ Processed: ${filePath}`);
      console.log(`   Functions: ${result.functions.length}`);
      console.log(`   Classes: ${result.classes.length}`);
      console.log(`   Exports: ${result.exports.length}`);
      console.log(`   Metrics: ${result.metrics.lines} lines, complexity: ${result.metrics.complexity}`);
    } catch (e) {
      console.error(`Error processing ${filePath}: ${e.message}`);
    }
  }
  
  return results;
}

/**
 * Main execution
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node scripts/ast-parser.js <file1> <file2> ...');
    console.error('Example: node scripts/ast-parser.js src/index.js src/utils.ts');
    process.exit(1);
  }
  
  console.log('🔍 AST Parser for JavaScript/TypeScript');
  console.log('='.repeat(50));
  
  const results = processFiles(args);
  
  console.log('='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  
  let totalFunctions = 0;
  let totalClasses = 0;
  let totalExports = 0;
  let totalLines = 0;
  let totalComplexity = 0;
  
  results.forEach(result => {
    totalFunctions += result.functions.length;
    totalClasses += result.classes.length;
    totalExports += result.exports.length;
    totalLines += result.metrics.lines;
    totalComplexity += result.metrics.complexity;
  });
  
  console.log(`Total Files: ${results.length}`);
  console.log(`Total Functions: ${totalFunctions}`);
  console.log(`Total Classes: ${totalClasses}`);
  console.log(`Total Exports: ${totalExports}`);
  console.log(`Total Lines: ${totalLines}`);
  console.log(`Total Complexity: ${totalComplexity}`);
  
  // Save results to JSON for downstream processing
  const outputPath = path.join(__dirname, 'ast-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n✅ Results saved to: ${outputPath}`);
}

main();
