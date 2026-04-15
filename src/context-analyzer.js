#!/usr/bin/env node

/**
 * Context Analyzer Module
 * 
 * Analyzes project structure to determine where to insert code
 * based on existing patterns and conventions.
 */

const fs = require('fs');
const path = require('path');
const { detectIntent } = require('./intent-detector');

/**
 * Analyze the project structure and return a map of directory purposes
 * 
 * @param {string} projectRoot - The root directory of the project (default: current directory)
 * @returns {Object} Analysis result with directory purposes and recommendations
 */
function analyzeProjectContext(projectRoot = process.cwd()) {
  const structure = {
    directories: {},
    files: [],
    patterns: {},
    recommendations: {}
  };

  // Scan the project structure
  scanDirectory(projectRoot, structure, 0); // Start at depth 0

  // Analyze patterns based on directory contents
  structure.patterns = analyzePatterns(structure);

  // Generate recommendations based on detected patterns
  structure.recommendations = generateRecommendations(structure);

  return structure;
}

/**
 * Recursively scan directory structure
 * 
 * @param {string} dir - Directory to scan
 * @param {Object} structure - Structure object to populate
 * @param {number} depth - Current depth (for limiting recursion)
 */
function scanDirectory(dir, structure, depth = 0) {
  if (depth > 2) return;

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const relativePath = path.relative(process.cwd(), dir) || '.';

    // Categorize this directory
    const dirName = path.basename(dir);
    const fileCount = items.filter(item => !item.isDirectory()).length;
    
    structure.directories[relativePath] = {
      name: dirName,
      itemCount: items.length,
      fileCount: fileCount,
      types: {
        scripts: 0,
        components: 0,
        utils: 0,
        tests: 0,
        configs: 0,
        docs: 0,
        other: 0
      }
    };

    items.forEach(item => {
      const ext = item.name.includes('.') ? path.extname(item.name) : '';
      
      structure.files.push({
        path: path.join(dir, item.name),
        relativePath: path.join(relativePath, item.name),
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file',
        extension: ext
      });

      // Categorize file types
      if (item.isDirectory()) {
        // Skip node_modules and other system directories
        if (item.name === 'node_modules' || item.name === '.git' || item.name === '.gsd.lock') {
          return;
        }
        // Recursively scan subdirectories
        scanDirectory(path.join(dir, item.name), structure, depth + 1);
      } else {
        // Count file types based on directory and extension
        if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
          if (dirName === 'scripts' || dirName === 'bin') {
            structure.directories[relativePath].types.scripts++;
          } else if (dirName === 'src' || dirName === 'lib') {
            structure.directories[relativePath].types.utils++;
          } else {
            structure.directories[relativePath].types.other++;
          }
        } else if (ext === '.ts' || ext === '.tsx') {
          if (dirName === 'components' || dirName === 'views') {
            structure.directories[relativePath].types.components++;
          } else {
            structure.directories[relativePath].types.utils++;
          }
        } else if (ext === '.css' || ext === '.scss' || ext === '.less') {
          structure.directories[relativePath].types.other++;
        } else if (ext === '.json' && (dirName === 'config' || item.name === 'package.json')) {
          structure.directories[relativePath].types.configs++;
        } else if (ext === '.md') {
          structure.directories[relativePath].types.docs++;
        } else if (dirName === 'tests' || dirName === 'test' || dirName === '__tests__') {
          structure.directories[relativePath].types.tests++;
        } else {
          structure.directories[relativePath].types.other++;
        }
      }
    });
  } catch (err) {
    // Skip directories we can't read
    console.warn(`⚠️  Could not read directory: ${dir}`);
  }
}

/**
 * Analyze patterns in the project structure
 * 
 * @param {Object} structure - The scanned structure
 * @returns {Object} Pattern analysis results
 */
function analyzePatterns(structure) {
  const patterns = {
    hasScriptsDir: false,
    hasSrcDir: false,
    hasLibDir: false,
    hasComponentsDir: false,
    hasUtilsDir: false,
    hasTestsDir: false,
    hasConfigsDir: false,
    hasDocsDir: false,
    mainEntry: 'scripts/',
    secondaryEntry: 'src/',
    componentLocations: [],
    utilityLocations: [],
    testLocations: []
  };

  // Detect directory patterns
  Object.keys(structure.directories).forEach(dir => {
    const dirInfo = structure.directories[dir];
    const dirName = dirInfo.name.toLowerCase();

    if (dirName === 'scripts') {
      patterns.hasScriptsDir = true;
      patterns.mainEntry = 'scripts/';
    } else if (dirName === 'src') {
      patterns.hasSrcDir = true;
      patterns.secondaryEntry = 'src/';
    } else if (dirName === 'lib') {
      patterns.hasLibDir = true;
    } else if (dirName === 'components') {
      patterns.hasComponentsDir = true;
      patterns.componentLocations.push(dir);
    } else if (dirName === 'utils' || dirName === 'utilities' || dirName === 'helpers') {
      patterns.hasUtilsDir = true;
      patterns.utilityLocations.push(dir);
    } else if (dirName === 'tests' || dirName === 'test' || dirName === '__tests__') {
      patterns.hasTestsDir = true;
      patterns.testLocations.push(dir);
    } else if (dirName === 'config' || dirName === 'configs') {
      patterns.hasConfigsDir = true;
    } else if (dirName === 'docs' || dirName === 'documentation') {
      patterns.hasDocsDir = true;
    }
  });

  // Analyze file distribution based on directory structure
  const fileDistribution = {
    scripts: 0,
    components: 0,
    utils: 0,
    tests: 0,
    configs: 0,
    docs: 0
  };

  // Count files per directory based on the directory structure
  Object.entries(structure.directories).forEach(([dir, info]) => {
    const dirName = info.name.toLowerCase();
    
    if (dirName === 'scripts') fileDistribution.scripts += info.fileCount;
    else if (dirName === 'components') fileDistribution.components += info.fileCount;
    else if (dirName === 'utils' || dirName === 'utilities') fileDistribution.utils += info.fileCount;
    else if (dirName === 'tests' || dirName === 'test' || dirName === '__tests__') fileDistribution.tests += info.fileCount;
    else if (dirName === 'config') fileDistribution.configs += info.fileCount;
    else if (dirName === 'docs' || dirName === 'documentation') fileDistribution.docs += info.fileCount;
  });

  patterns.fileDistribution = fileDistribution;

  return patterns;
}

/**
 * Generate recommendations based on the analysis
 * 
 * @param {Object} structure - The scanned structure with patterns
 * @returns {Object} Recommendations for code placement
 */
function generateRecommendations(structure) {
  const recommendations = {
    forScripts: [],
    forComponents: [],
    forUtils: [],
    forTests: [],
    forConfigs: [],
    forDocs: []
  };

  // Recommendation based on detected patterns
  if (structure.patterns.hasScriptsDir) {
    recommendations.forScripts.push({
      path: 'scripts/',
      reason: 'Existing scripts directory detected - ideal for CLI and build tools'
    });
  } else {
    recommendations.forScripts.push({
      path: 'scripts/',
      reason: 'Create scripts/ directory for CLI and utility scripts'
    });
  }

  if (structure.patterns.hasSrcDir) {
    recommendations.forUtils.push({
      path: 'src/lib/',
      reason: 'Existing src/lib/ directory - good for shared utilities and libraries'
    });
  } else if (structure.patterns.hasLibDir) {
    recommendations.forUtils.push({
      path: 'lib/',
      reason: 'Existing lib/ directory - suitable for library code'
    });
  } else {
    recommendations.forUtils.push({
      path: 'src/lib/',
      reason: 'Create src/lib/ for library and utility code'
    });
  }

  if (structure.patterns.hasComponentsDir) {
    recommendations.forComponents.push({
      path: structure.patterns.componentLocations[0],
      reason: 'Existing components directory'
    });
  } else {
    recommendations.forComponents.push({
      path: 'components/',
      reason: 'Create components/ directory for UI components'
    });
  }

  if (structure.patterns.hasTestsDir) {
    recommendations.forTests.push({
      path: structure.patterns.testLocations[0],
      reason: 'Existing test directory'
    });
  } else {
    recommendations.forTests.push({
      path: 'tests/',
      reason: 'Create tests/ directory for test files'
    });
  }

  // Generate a summary of the project structure
  recommendations.summary = {
    primaryStructure: structure.patterns.hasScriptsDir ? 'scripts-based' : 'src-based',
    hasComponentSystem: structure.patterns.hasComponentsDir,
    hasUtilitySystem: structure.patterns.hasUtilsDir || structure.patterns.hasLibDir,
    hasTestSystem: structure.patterns.hasTestsDir,
    recommendedStructure: {
      scripts: 'scripts/',
      lib: 'src/lib/',
      components: 'components/',
      tests: 'tests/'
    }
  };

  return recommendations;
}

/**
 * Analyze code intent and recommend where to place the code
 * 
 * @param {string} intentDescription - Description of what code to add
 * @param {Object} context - Project context from analyzeProjectContext()
 * @returns {Object} Recommendation with path and reasoning
 */
function recommendCodePlacement(intentDescription, context) {
  // Detect the intent from the description
  const intent = detectIntent(intentDescription);
  
  // Determine placement based on intent type and project patterns
  const placement = {
    path: '',
    reason: '',
    intent: intent.type,
    confidence: 0.8
  };

  // Map intent types to directory recommendations based on detected patterns
  let recommendedPath;
  let reason;
  
  // Check if this is a snippet type based on query context
  const isSnippet = intentDescription.toLowerCase().includes('snippet') || 
                    intentDescription.toLowerCase().includes('script') ||
                    intent.type === 'snippet' || 
                    intent.type === 'script';
  
  // Map intent types to directory recommendations based on detected patterns
  switch (intent.type) {
    case 'script':
      recommendedPath = 'scripts/';
      reason = context.patterns.hasScriptsDir ? 
        'Existing scripts directory detected - ideal for CLI and build tools' : 
        'Create scripts/ for scripts and automation helpers';
      placement.confidence = 0.9;
      break;
    case 'utility':
      recommendedPath = context.patterns.hasLibDir ? 'src/lib/' : 'src/lib/';
      reason = context.patterns.hasLibDir ? 
        'Existing src/lib/ directory - good for shared utilities and libraries' : 
        'Create src/lib/ for library and utility code';
      placement.confidence = 0.9;
      break;
    case 'component':
      if (context.patterns.hasComponentsDir) {
        recommendedPath = context.patterns.componentLocations[0];
      } else {
        recommendedPath = 'components/';
      }
      reason = context.patterns.hasComponentsDir ? 
        'Existing components directory' : 
        'Create components/ directory for UI components';
      placement.confidence = 0.85;
      break;
    case 'test':
      if (context.patterns.hasTestsDir) {
        recommendedPath = context.patterns.testLocations[0];
      } else {
        recommendedPath = 'tests/';
      }
      reason = context.patterns.hasTestsDir ? 
        'Existing test directory' : 
        'Create tests/ directory for test files';
      placement.confidence = 0.9;
      break;
    case 'config':
      recommendedPath = context.patterns.hasConfigsDir ? 'config/' : 'config/';
      reason = context.patterns.hasConfigsDir ? 
        'Existing config directory' : 
        'Create config/ directory for configuration files';
      placement.confidence = 0.85;
      break;
    case 'documentation':
      recommendedPath = context.patterns.hasDocsDir ? 'docs/' : 'docs/';
      reason = context.patterns.hasDocsDir ? 
        'Existing docs directory' : 
        'Create docs/ directory for documentation';
      placement.confidence = 0.9;
      break;
    case 'snippet':
      recommendedPath = context.patterns.hasScriptsDir ? 'scripts/' : 'scripts/';
      reason = context.patterns.hasScriptsDir ? 
        'Scripts directory exists - use it for reusable project scripts' : 
        'Create scripts/ for reusable project scripts';
      placement.confidence = 0.85;
      break;
    case 'example':
      recommendedPath = context.patterns.hasScriptsDir ? 'scripts/examples/' : 'scripts/';
      reason = context.patterns.hasScriptsDir ? 
        'Scripts directory exists - use examples subdirectory' : 
        'Create scripts/examples/ for code examples';
      placement.confidence = 0.8;
      break;
    default:
      // Fallback to most common pattern
      recommendedPath = context.patterns.hasScriptsDir ? 'scripts/' : 'src/lib/';
      reason = context.patterns.hasScriptsDir ? 
        'Using scripts/ as primary code location' : 
        'Using src/lib/ as primary code location';
      placement.confidence = 0.7;
  }

  placement.path = recommendedPath;
  placement.reason = reason;

  return placement;
}

/**
 * Generate a structured report of the analysis
 * 
 * @param {Object} context - The full project context
 * @returns {string} Formatted report
 */
function generateReport(context) {
  let report = '📊 Project Context Analysis Report\n';
  report += '='.repeat(60) + '\n\n';

  // Directory Structure
  report += '📁 Directory Structure:\n';
  report += '-'.repeat(40) + '\n';
  
  Object.keys(context.directories).forEach(dir => {
    const info = context.directories[dir];
    report += `  ${dir}/\n`;
    report += `    Total items: ${info.itemCount} (files: ${info.fileCount})\n`;
  });

  // Pattern Analysis
  report += '\n🔍 Pattern Analysis:\n';
  report += '-'.repeat(40) + '\n';
  report += `  Scripts Directory: ${context.patterns.hasScriptsDir ? '✅' : '❌'}\n`;
  report += `  Source Directory: ${context.patterns.hasSrcDir ? '✅' : '❌'}\n`;
  report += `  Library Directory: ${context.patterns.hasLibDir ? '✅' : '❌'}\n`;
  report += `  Components Directory: ${context.patterns.hasComponentsDir ? '✅' : '❌'}\n`;
  report += `  Utils Directory: ${context.patterns.hasUtilsDir ? '✅' : '❌'}\n`;
  report += `  Tests Directory: ${context.patterns.hasTestsDir ? '✅' : '❌'}\n`;

  // File Distribution
  report += '\n📄 File Distribution:\n';
  report += '-'.repeat(40) + '\n';
  const dist = context.patterns.fileDistribution;
  report += `  Scripts: ${dist.scripts}\n`;
  report += `  Components: ${dist.components}\n`;
  report += `  Utilities: ${dist.utils}\n`;
  report += `  Tests: ${dist.tests}\n`;
  report += `  Configs: ${dist.configs}\n`;
  report += `  Docs: ${dist.docs}\n`;
  report += `  Total directories: ${Object.keys(context.directories).length}\n`;

  // Recommendations
  report += '\n💡 Recommendations:\n';
  report += '-'.repeat(40) + '\n';
  
  Object.entries(context.recommendations).slice(0, 5).forEach(([key, recs]) => {
    if (Array.isArray(recs) && recs.length > 0) {
      const category = key.replace('for', '').toUpperCase();
      recs.slice(0, 2).forEach(rec => {
        report += `  ${category}: ${rec.path}\n`;
        report += `    → ${rec.reason}\n`;
      });
    }
  });

  // Summary
  report += '\n📋 Summary:\n';
  report += '-'.repeat(40) + '\n';
  const summary = context.recommendations.summary;
  report += `  Primary Structure: ${summary.primaryStructure}\n`;
  report += `  Component System: ${summary.hasComponentSystem ? '✅' : '❌'}\n`;
  report += `  Utility System: ${summary.hasUtilitySystem ? '✅' : '❌'}\n`;
  report += `  Test System: ${summary.hasTestSystem ? '✅' : '❌'}\n`;

  return report;
}

/**
 * Main execution - demonstrate the context analyzer
 */
function main() {
  console.log('🔍 Context Analyzer Module');
  console.log('='.repeat(60));
  console.log('Analyzing project structure...\n');

  // Analyze current project
  const context = analyzeProjectContext();

  // Generate and display report
  const report = generateReport(context);
  console.log(report);

  // Demonstrate intent-based placement recommendations
  console.log('\n🎯 Intent-Based Placement Examples:\n');
  
  const examples = [
    'Create a CLI command for project setup',
    'Add a utility function for data processing',
    'Build a React component for user profile',
    'Write tests for authentication module',
    'Add configuration for development environment',
    'Create documentation for API endpoints',
    'Add a script to run build process',
    'Create a helper function for file handling',
    'Add a test suite for API endpoints',
    'Create config file for development'
  ];

  examples.forEach(example => {
    const placement = recommendCodePlacement(example, context);
    console.log(`  "${example}"`);
    console.log(`    → ${placement.path}`);
    console.log(`    Reason: ${placement.reason} (confidence: ${placement.confidence})\n`);
  });

  console.log('✅ Context analyzer ready!');
}

// Export for use in other modules
module.exports = {
  analyzeProjectContext,
  scanDirectory,
  analyzePatterns,
  generateRecommendations,
  recommendCodePlacement,
  generateReport
};

// Execute if run directly
if (require.main === module) {
  main();
}
